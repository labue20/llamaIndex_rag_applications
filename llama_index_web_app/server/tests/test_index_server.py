"""
index_server.py: reading PDFs, chunking, page-aware retrieval, ownership and
deletion, using a real LlamaIndex index with mock embeddings and a mock LLM
(which echoes its prompt, so tests can see exactly what context was sent).
"""

import pickle

import pytest
from llama_index.core import StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.embeddings import MockEmbedding
from llama_index.core.llms import MockLLM

import index_server as srv

OWNER = "owner-1"
OTHER = "owner-2"


@pytest.fixture(autouse=True)
def index(tmp_path, monkeypatch):
    """A fresh, empty index and document store in a temp dir; no OpenAI."""
    monkeypatch.setattr(srv, "index_name", str(tmp_path / "saved_index"))
    monkeypatch.setattr(srv, "pkl_name", str(tmp_path / "stored_documents.pkl"))
    monkeypatch.setattr(srv, "stored_docs", {})
    monkeypatch.setattr(srv, "index", VectorStoreIndex(nodes=[], embed_model=MockEmbedding(embed_dim=8)))
    monkeypatch.setattr(srv, "get_cached_components", lambda: (MockEmbedding(embed_dim=8), MockLLM()))
    monkeypatch.setattr(srv, "OpenAI", lambda **kwargs: MockLLM())
    monkeypatch.setitem(srv._pipeline_cache, "fast_pipeline", None)
    return srv.index


def _chunks(doc_id):
    return [n for n in srv.index.docstore.docs.values() if n.metadata.get("doc_id") == doc_id]


def _insert(make_pdf, doc_id="doc-1", owner=OWNER, pages=8, mode="fast", name="report.pdf"):
    path = make_pdf(pages=pages, name=f"{doc_id}.pdf", marker=f"Content of {doc_id}")
    result = srv.insert_into_index(str(path), doc_id, mode, owner, name)
    assert result["success"], result
    return path


# --- page references -----------------------------------------------------

@pytest.mark.parametrize("question,pages", [
    ("what do we have on page 7", [7]),
    ("Summarize pages 3-5", [3, 4, 5]),
    ("pages 2 and 9", [2, 9]),
    ("pages 2, 4 and 9", [2, 4, 9]),
    ("pg. 2 and page 9", [2, 9]),
    ("what's on pages 4 to 6", [4, 5, 6]),
    ("Page 12 through 10", [10, 11, 12]),
    ("page 3 to 5 and 8", [3, 4, 5, 8]),
    ("How much tax did I pay?", []),
    ("I paid $7 on 3 items", []),
])
def test_extract_page_numbers(question, pages):
    assert srv.extract_page_numbers(question) == pages


def test_extract_page_numbers_caps_huge_ranges():
    assert len(srv.extract_page_numbers("pages 1-500")) == 20


# --- reading and chunking ----------------------------------------------------

def test_fast_mode_indexes_every_page(make_pdf):
    _insert(make_pdf, pages=8)
    chunks = _chunks("doc-1")
    assert sorted({int(c.metadata["source"]) for c in chunks}) == list(range(1, 9))
    assert any("This is page 8." in c.text for c in chunks)


def test_fast_mode_records_owner_and_name(make_pdf):
    _insert(make_pdf, name="Tax Return.pdf")
    stored = srv.stored_docs["doc-1"]
    assert stored["owner_id"] == OWNER
    assert stored["file_name"] == "Tax Return.pdf"
    assert stored["processing_mode"] == "fast"


def test_ultra_fast_keeps_every_page_and_the_given_id(make_pdf):
    _insert(make_pdf, pages=8, mode="ultra-fast")
    stored = srv.stored_docs["doc-1"]
    for page in range(1, 9):
        assert f"[Page {page}]" in stored["full_text"]
        assert f"This is page {page}." in stored["full_text"]
    assert stored["document_summary"]["statistics"]["estimated_pages"] == 8
    assert stored["indexed"] is False
    assert stored["owner_id"] == OWNER


def test_background_indexing_indexes_and_removes_the_file(make_pdf):
    path = _insert(make_pdf, pages=4, mode="ultra-fast")
    assert _chunks("doc-1") == []

    assert srv.background_index_document("doc-1", OWNER) is True

    assert len({c.metadata["source"] for c in _chunks("doc-1")}) == 4
    assert srv.stored_docs["doc-1"]["indexed"] is True
    assert srv.stored_docs["doc-1"]["indexing_status"] == "indexed"
    assert srv.stored_docs["doc-1"]["owner_id"] == OWNER
    assert not path.exists()


def test_background_indexing_refuses_other_users(make_pdf):
    _insert(make_pdf, mode="ultra-fast")
    assert srv.background_index_document("doc-1", OTHER) is False


# --- chat ------------------------------------------------------------------

def test_page_question_retrieves_only_that_page(make_pdf):
    _insert(make_pdf, pages=8)
    result = srv.chat_with_document("What is on page 7?", "doc-1", OWNER)
    prompt = result["response"]  # MockLLM echoes the prompt it was given

    assert "This is page 7." in prompt
    for other_page in (1, 2, 3, 4, 5, 6, 8):
        assert f"This is page {other_page}." not in prompt
    # The model is told what the page metadata means
    assert 'the "source" value is the page number' in prompt


def test_page_range_question_retrieves_those_pages(make_pdf):
    _insert(make_pdf, pages=8)
    prompt = srv.chat_with_document("Summarize pages 2-3", "doc-1", OWNER)["response"]
    assert "This is page 2." in prompt and "This is page 3." in prompt
    assert "This is page 5." not in prompt


def test_chat_question_is_not_wrapped_in_instructions(make_pdf, monkeypatch):
    """Retrieval should embed the user's question only."""
    _insert(make_pdf)
    seen = []
    original = srv.index.as_query_engine

    def spy(**kwargs):
        engine = original(**kwargs)
        query = engine.query
        engine.query = lambda text: seen.append(text) or query(text)
        return engine

    monkeypatch.setattr(srv.index, "as_query_engine", spy)
    srv.chat_with_document("Who signed it?", "doc-1", OWNER)
    assert seen == ["Who signed it?"]


def test_chat_only_uses_the_requested_document(make_pdf):
    _insert(make_pdf, "doc-1")
    _insert(make_pdf, "doc-2")
    prompt = srv.chat_with_document("What is this about?", "doc-1", OWNER)["response"]
    assert "Content of doc-1" in prompt
    assert "Content of doc-2" not in prompt


def test_chat_before_indexing_uses_the_whole_text(make_pdf, monkeypatch):
    _insert(make_pdf, pages=8, mode="ultra-fast")
    result = srv.chat_with_document("What is on the last page?", "doc-1", OWNER)
    assert "This is page 8." in result["response"]
    assert "indexing in progress" in result["note"]


def test_chat_with_another_users_document_is_refused(make_pdf):
    _insert(make_pdf)
    result = srv.chat_with_document("hi", "doc-1", OTHER)
    assert result["response"] is None
    assert "not found" in result["error"]


# --- ownership -------------------------------------------------------------

def test_documents_list_is_per_owner(make_pdf):
    _insert(make_pdf, "doc-1", owner=OWNER, name="mine.pdf")
    _insert(make_pdf, "doc-2", owner=OTHER, name="theirs.pdf")

    mine = srv.get_documents_list(OWNER)
    assert [(d["id"], d["filename"]) for d in mine] == [("doc-1", "mine.pdf")]
    assert srv.get_documents_list(None) == []


def test_full_content_is_per_owner(make_pdf):
    _insert(make_pdf)
    assert "error" in srv.get_full_document_content("doc-1", OTHER)
    assert "error" not in srv.get_full_document_content("doc-1", OWNER)


def test_query_index_searches_only_the_owners_documents(make_pdf):
    _insert(make_pdf, "doc-1", owner=OWNER)
    _insert(make_pdf, "doc-2", owner=OTHER)
    prompt = str(srv.query_index("What is this about?", OWNER))
    assert "Content of doc-1" in prompt
    assert "Content of doc-2" not in prompt
    assert "don't have any documents" in srv.query_index("hi", "nobody")


def test_claim_unowned_documents(make_pdf):
    _insert(make_pdf, "doc-1", owner=None)
    _insert(make_pdf, "doc-2", owner=OTHER)
    assert srv.claim_unowned_documents(OWNER) == 1
    assert srv.stored_docs["doc-1"]["owner_id"] == OWNER
    assert srv.stored_docs["doc-2"]["owner_id"] == OTHER


# --- deletion --------------------------------------------------------------

def test_delete_removes_every_chunk_and_persists(make_pdf):
    _insert(make_pdf, "doc-1")
    _insert(make_pdf, "doc-2")
    count = len(_chunks("doc-1"))

    result = srv.delete_document("doc-1", OWNER)

    assert result["success"] and result["removed_chunks"] == count
    assert _chunks("doc-1") == []
    assert _chunks("doc-2")  # untouched
    assert all(m.get("doc_id") != "doc-1" for m in srv.index.vector_store.data.metadata_dict.values())
    with open(srv.pkl_name, "rb") as f:
        assert "doc-1" not in pickle.load(f)

    # The deletion is saved to disk, not just applied in memory
    reloaded = load_index_from_storage(
        StorageContext.from_defaults(persist_dir=srv.index_name), embed_model=MockEmbedding(embed_dim=8)
    )
    doc_ids = {n.metadata.get("doc_id") for n in reloaded.docstore.docs.values()}
    assert doc_ids == {"doc-2"}
    assert len(reloaded.vector_store.data.embedding_dict) == len(_chunks("doc-2"))


def test_delete_refuses_other_users(make_pdf):
    _insert(make_pdf)
    assert srv.delete_document("doc-1", OTHER)["success"] is False
    assert _chunks("doc-1")


def test_purge_removes_orphaned_and_legacy_chunks(make_pdf):
    _insert(make_pdf, "doc-1")
    _insert(make_pdf, "doc-2")
    del srv.stored_docs["doc-2"]  # deleted before deletion cleaned the index
    legacy = _chunks("doc-1")[0]
    legacy.metadata.pop("doc_id")  # chunk from before doc IDs existed
    srv.index.docstore.add_documents([legacy])

    removed = srv.purge_orphaned_nodes()

    assert removed > 0
    assert _chunks("doc-2") == []
    assert all(n.metadata.get("doc_id") for n in srv.index.docstore.docs.values())
    assert _chunks("doc-1")
