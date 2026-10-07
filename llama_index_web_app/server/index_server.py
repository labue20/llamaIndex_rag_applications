import os
import pickle
import re

# NOTE: for local testing only, do NOT deploy with your key hardcoded
# Use environment variable for production: export OPENAI_API_KEY=your_key_here
# os.environ['OPENAI_API_KEY'] = "your_openai_api_key_here"

from multiprocessing import Lock
from multiprocessing.managers import BaseManager
from llama_index.core import (
    SimpleDirectoryReader, 
    VectorStoreIndex, 
    StorageContext, 
    load_index_from_storage,
    Document,
    PromptTemplate,
)
from llama_index.core.node_parser import (
    SentenceSplitter,
    SemanticSplitterNodeParser,
    TokenTextSplitter,
)
from llama_index.core.extractors import (
    TitleExtractor,
    KeywordExtractor,
)
from llama_index.core.ingestion import IngestionPipeline
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.readers.file import PyMuPDFReader

index = None
stored_docs = {}
lock = Lock()

index_name = "./saved_index"
pkl_name = "stored_documents.pkl"

# Max characters sent to the LLM when chatting with a not-yet-indexed document.
# gpt-4o-mini has a 128k-token context (~4 chars/token), so this leaves headroom.
MAX_DIRECT_CHAT_CHARS = 300_000


# Global pipeline cache to avoid recreating expensive components
_pipeline_cache = {
    "fast_pipeline": None,
    "semantic_pipeline": None,
    "embed_model": None,
    "llm": None
}

def get_cached_components():
    """Get or create cached expensive components."""
    if _pipeline_cache["embed_model"] is None:
        _pipeline_cache["embed_model"] = OpenAIEmbedding(model_name="text-embedding-3-small")
    
    if _pipeline_cache["llm"] is None:
        _pipeline_cache["llm"] = OpenAI(model="gpt-4o-mini", temperature=0.1)
    
    return _pipeline_cache["embed_model"], _pipeline_cache["llm"]

def create_fast_chunking_pipeline():
    """Create a fast chunking pipeline without expensive LLM extractors."""
    
    embed_model, llm = get_cached_components()
    
    if _pipeline_cache["fast_pipeline"] is not None:
        return _pipeline_cache["fast_pipeline"]
    
    # Use simpler, faster chunking strategies
    sentence_splitter = SentenceSplitter(
        chunk_size=512,
        chunk_overlap=50,
        paragraph_separator="\n\n\n",
        secondary_chunking_regex="[^,.;。]+[,.;。]?",
    )
    
    token_splitter = TokenTextSplitter(
        chunk_size=512,
        chunk_overlap=50,
        separator=" ",
    )
    
    # Cache the fast pipeline
    _pipeline_cache["fast_pipeline"] = {
        "sentence_splitter": sentence_splitter,
        "token_splitter": token_splitter,
        "embed_model": embed_model,
        "llm": llm
    }
    
    return _pipeline_cache["fast_pipeline"]

def create_enhanced_chunking_pipeline():
    """Create an enhanced chunking pipeline with optional semantic features."""
    
    embed_model, llm = get_cached_components()
    
    if _pipeline_cache["semantic_pipeline"] is not None:
        return _pipeline_cache["semantic_pipeline"]
    
    try:
        # Only use semantic splitter if explicitly requested
        semantic_splitter = SemanticSplitterNodeParser(
            buffer_size=1,
            breakpoint_percentile_threshold=95,
            embed_model=embed_model,
        )
        
        # Reduced extractors for better performance
        extractors = [
            TitleExtractor(nodes=3, llm=llm),  # Reduced from 5 to 3
            KeywordExtractor(keywords=5, llm=llm),  # Reduced from 10 to 5
        ]
        
        # Create ingestion pipeline
        pipeline = IngestionPipeline(
            transformations=[
                semantic_splitter,
                *extractors,
            ]
        )
        
        # Cache the semantic pipeline
        _pipeline_cache["semantic_pipeline"] = {
            "pipeline": pipeline,
            "embed_model": embed_model,
            "llm": llm
        }
        
        return _pipeline_cache["semantic_pipeline"]
        
    except Exception as e:
        print(f"Failed to create semantic pipeline: {e}")
        return create_fast_chunking_pipeline()


def initialize_index():
    """Create a new global index, or load one from the pre-set path."""
    global index, stored_docs
    
    embed_model = OpenAIEmbedding(model_name="text-embedding-3-small")
    with lock:
        try:
            if os.path.exists(index_name):
                index = load_index_from_storage(
                    StorageContext.from_defaults(persist_dir=index_name), embed_model=embed_model
                )
                print("Loaded existing index from storage")
            else:
                index = VectorStoreIndex(nodes=[], embed_model=embed_model)
                index.storage_context.persist(persist_dir=index_name)
                print("Created new index")
        except Exception as e:
            print(f"Error loading index, creating new one: {str(e)}")
            index = VectorStoreIndex(nodes=[], embed_model=embed_model)
            index.storage_context.persist(persist_dir=index_name)
            
        try:
            if os.path.exists(pkl_name):
                with open(pkl_name, "rb") as f:
                    stored_docs = pickle.load(f)
                print(f"Loaded {len(stored_docs)} stored documents")
        except Exception as e:
            print(f"Error loading stored documents, starting fresh: {str(e)}")
            stored_docs = {}


def ping():
    """Health check: the index server is up and answering."""
    return True


def _owned_doc(doc_id, owner_id):
    """Return the stored document if it exists and belongs to owner_id, else None."""
    doc_info = stored_docs.get(doc_id)
    if isinstance(doc_info, dict) and owner_id and doc_info.get("owner_id") == owner_id:
        return doc_info
    return None


def _doc_display_name(doc_info, doc_id):
    return doc_info.get("file_name") or os.path.basename(doc_info.get("file_path") or doc_id)


def claim_guest_documents(guest_id, owner_id):
    """Move a guest's documents into the account they signed up or logged in with."""
    if not guest_id or not str(guest_id).startswith("guest_"):
        return 0
    with lock:
        moved = 0
        for doc_info in stored_docs.values():
            if isinstance(doc_info, dict) and doc_info.get("owner_id") == guest_id:
                doc_info["owner_id"] = owner_id
                moved += 1
        if moved:
            with open(pkl_name, "wb") as f:
                pickle.dump(stored_docs, f)
    return moved


def purge_expired_guest_documents(max_age_hours):
    """Delete guest documents (chunks, records and files) older than max_age_hours."""
    import datetime as _dt
    cutoff = _dt.datetime.now() - _dt.timedelta(hours=max_age_hours)
    expired = []
    for doc_id, doc_info in list(stored_docs.items()):
        if not isinstance(doc_info, dict) or not str(doc_info.get("owner_id", "")).startswith("guest_"):
            continue
        try:
            created = _dt.datetime.fromisoformat(doc_info.get("processing_timestamp", ""))
        except ValueError:
            created = None
        if created is None or created < cutoff:
            expired.append((doc_id, doc_info["owner_id"]))
    for doc_id, owner_id in expired:
        delete_document(doc_id, owner_id)
    if expired:
        print(f"Deleted {len(expired)} expired guest documents", flush=True)
    return len(expired)


def _purge_guest_documents_periodically(max_age_hours, interval_seconds=1800):
    import threading as _threading

    def loop():
        while True:
            try:
                purge_expired_guest_documents(max_age_hours)
            except Exception as e:
                print(f"Guest document cleanup failed: {e}", flush=True)
            _threading.Event().wait(interval_seconds)

    _threading.Thread(target=loop, daemon=True, name="guest-cleanup").start()


def claim_unowned_documents(owner_id):
    """Give documents uploaded before accounts existed to owner_id."""
    with lock:
        claimed = 0
        for doc_info in stored_docs.values():
            if isinstance(doc_info, dict) and not doc_info.get("owner_id"):
                doc_info["owner_id"] = owner_id
                claimed += 1
        if claimed:
            with open(pkl_name, "wb") as f:
                pickle.dump(stored_docs, f)
    print(f"Assigned {claimed} existing documents to the first account", flush=True)
    return claimed


def query_index(query_text, owner_id):
    """Query across all of owner_id's documents."""
    global index
    from llama_index.core.vector_stores import MetadataFilters, MetadataFilter, FilterOperator

    owned_ids = [doc_id for doc_id in stored_docs if _owned_doc(doc_id, owner_id)]
    if not owned_ids:
        return "You don't have any documents yet. Upload one to start asking questions."

    llm = OpenAI(model="gpt-4o-mini")
    
    # Create enhanced query engine with better retrieval
    query_engine = index.as_query_engine(
        filters=MetadataFilters(filters=[
            MetadataFilter(key="doc_id", value=owned_ids, operator=FilterOperator.IN)
        ]),
        similarity_top_k=5,  # Get more candidates
        llm=llm,
        response_mode="tree_summarize",  # Better for complex documents
        use_async=False,
        streaming=False,
        node_postprocessors=[],  # Can add reranking here if needed
    )
    
    response = query_engine.query(query_text)
    return response


# "page 7", "pages 3-5", "pages 2, 4 and 9", "pg. 10 through 12"
_PAGE_REF_RE = re.compile(
    r"\bp(?:ages?|g)\.?\s*(\d+(?:\s*(?:,|-|–|&|\band\b|\bto\b|\bthrough\b)\s*\d+)*)",
    re.IGNORECASE,
)
_PAGE_RANGE_RE = re.compile(r"(\d+)\s*(?:-|–|\bto\b|\bthrough\b)\s*(\d+)", re.IGNORECASE)


def extract_page_numbers(message, max_pages=20):
    """Return the page numbers a question explicitly refers to."""
    pages = set()
    for match in _PAGE_REF_RE.finditer(message):
        spec = match.group(1)
        for start, end in _PAGE_RANGE_RE.findall(spec):
            start, end = sorted((int(start), int(end)))
            pages.update(range(start, min(end, start + max_pages - 1) + 1))
        pages.update(int(n) for n in re.findall(r"\d+", _PAGE_RANGE_RE.sub("", spec)))
    return sorted(pages)[:max_pages]


def chat_with_document(message, document_id, owner_id):
    """Chat with a specific document using enhanced retrieval and conversational context."""
    global index, stored_docs
    
    document_info = _owned_doc(document_id, owner_id)
    if document_info is None:
        return {
            "error": f"Document '{document_id}' not found",
            "response": None
        }
    
    try:
        doc_name = _doc_display_name(document_info, document_id)
        
        # Check if document is fully indexed or just ultra-fast processed
        is_indexed = document_info.get('indexed', True)  # Assume indexed if not specified
        
        if not is_indexed and document_info.get('processing_mode') == 'ultra-fast':
            # For ultra-fast processed documents, use the full text directly with LLM
            print(f"Using direct text chat for ultra-fast document: {document_id}")
            return chat_with_text_directly(message, document_info, doc_name)
        
        # For fully indexed documents, use the vector index
        llm = OpenAI(model="gpt-4o-mini", temperature=0.1)
        
        # Use filters to only retrieve nodes from the specified document
        from llama_index.core.vector_stores import MetadataFilters, MetadataFilter, FilterOperator
        
        # Create metadata filter for the specific document
        filters = MetadataFilters(filters=[
            MetadataFilter(
                key="doc_id",
                value=document_id,
                operator=FilterOperator.EQ
            )
        ])
        similarity_top_k = 8

        # Page numbers aren't in the chunk text, so semantic search can't find
        # "page 7". When the question names pages, restrict retrieval to them.
        # PDF chunks carry their page number as the "source" metadata string.
        pages = extract_page_numbers(message)
        if pages:
            filters.filters.append(MetadataFilter(
                key="source",
                value=[str(p) for p in pages],
                operator=FilterOperator.IN
            ))
            similarity_top_k = max(similarity_top_k, 4 * len(pages))
        
        # Put the document-specific instructions in the answer prompt rather than the
        # query, so retrieval embeds only the user's question
        qa_template = PromptTemplate(
            "You are having a conversation about the document \"{doc_name}\".\n"
            "Context from this document is below. Each excerpt starts with its metadata; "
            "the \"source\" value is the page number the excerpt comes from.\n"
            "---------------------\n"
            "{context_str}\n"
            "---------------------\n"
            "Using only the information in this document, give a detailed and helpful answer to the question.\n"
            "If the information isn't available in this document, say so clearly.\n"
            "Question: {query_str}\n"
            "Answer: "
        ).partial_format(doc_name=doc_name)

        # Create query engine with document-specific filtering
        query_engine = index.as_query_engine(
            text_qa_template=qa_template,
            similarity_top_k=similarity_top_k,
            llm=llm,
            response_mode="compact",  # Good for conversational responses
            use_async=False,
            streaming=False,
            filters=filters,
            node_postprocessors=[],
        )
        
        response = query_engine.query(message)
        
        return {
            "response": str(response),
            "document_id": document_id,
            "document_name": doc_name
        }
        
    except Exception as e:
        print(f"Error in chat_with_document: {str(e)}")
        return {
            "error": f"Failed to process chat message: {str(e)}",
            "response": None
        }


def chat_with_text_directly(message, document_info, doc_name):
    """Chat with document using direct text analysis (for ultra-fast processed docs)."""
    try:
        llm = OpenAI(model="gpt-4o-mini", temperature=0.1)
        
        # Get the full text from the document
        full_text = document_info.get('full_text', '')
        content_preview = document_info.get('document_summary', {}).get('content_preview', '')
        text_to_use = full_text if full_text else content_preview
        truncated = len(text_to_use) > MAX_DIRECT_CHAT_CHARS
        if truncated:
            text_to_use = text_to_use[:MAX_DIRECT_CHAT_CHARS]
        
        # Create a direct prompt with the document text
        direct_prompt = f"""
You are analyzing the document "{doc_name}". Here is the content of the document:

--- DOCUMENT CONTENT START ---
{text_to_use}
--- DOCUMENT CONTENT END ---

Based on this document content, please answer the following question:

{message}

Please provide a detailed and helpful response based solely on the information contained in this document.
If the information isn't available in this document, please say so clearly.
"""
        
        # Get response directly from LLM
        response = llm.complete(direct_prompt)
        
        return {
            "response": str(response),
            "document_id": document_info.get('doc_id', 'unknown'),
            "document_name": doc_name,
            "note": (
                f"Response generated using direct text analysis (indexing failed: {document_info.get('indexing_error')})"
                if document_info.get('indexing_status') == "failed"
                else "Response generated using direct text analysis (document indexing in progress)"
            ) + (" - document was too long and was truncated" if truncated else "")
        }
        
    except Exception as e:
        print(f"Error in direct text chat: {str(e)}")
        return {
            "error": f"Failed to process chat with direct text: {str(e)}",
            "response": None
        }


def create_document_summary(full_text, processed_nodes):
    """Create a comprehensive summary of the entire document."""
    
    # Calculate basic statistics
    total_chars = len(full_text)
    total_words = len(full_text.split())
    total_lines = len(full_text.split('\n'))
    
    # Extract key sections (first few paragraphs, middle section, conclusion)
    paragraphs = [p.strip() for p in full_text.split('\n\n') if p.strip()]
    
    summary_parts = []
    
    # Beginning of document (first 2 paragraphs or 500 chars, whichever is longer)
    if paragraphs:
        beginning = '\n\n'.join(paragraphs[:2])
        if len(beginning) < 500 and len(full_text) > 500:
            beginning = full_text[:500] + "..."
        summary_parts.append(f"BEGINNING:\n{beginning[:500]}...")
    
    # Middle section (if document is long enough)
    if len(paragraphs) > 6:
        middle_start = len(paragraphs) // 3
        middle_end = min(middle_start + 2, len(paragraphs))
        middle = '\n\n'.join(paragraphs[middle_start:middle_end])
        summary_parts.append(f"MIDDLE SECTION:\n{middle[:400]}...")
    
    # End of document (last paragraph or last 300 chars)
    if len(paragraphs) > 1:
        ending = paragraphs[-1]
        if len(ending) < 200 and len(full_text) > 300:
            ending = full_text[-300:]
        summary_parts.append(f"ENDING:\n{ending[:300]}...")
    
    # Extract key metadata from nodes
    node_summaries = []
    for i, node in enumerate(processed_nodes[:5]):  # First 5 nodes
        if hasattr(node, 'metadata') and node.metadata:
            # Look for extracted titles, keywords, summaries
            title = node.metadata.get('document_title', node.metadata.get('section_summary', f'Section {i+1}'))
            keywords = node.metadata.get('excerpt_keywords', '')
            node_summaries.append(f"• {title}: {keywords}")
    
    # Combine all parts
    document_summary = {
        "statistics": {
            "total_characters": total_chars,
            "total_words": total_words,
            "total_lines": total_lines,
            "total_paragraphs": len(paragraphs)
        },
        "content_preview": '\n\n'.join(summary_parts),
        "full_text_sample": full_text[:1000] + "..." if len(full_text) > 1000 else full_text
    }
    
    return document_summary


def _set_indexing_status(doc_id, status, error=None):
    """Record a document's background indexing status and persist it."""
    with lock:
        if doc_id not in stored_docs:
            return
        stored_docs[doc_id]['indexing_status'] = status
        if error:
            stored_docs[doc_id]['indexing_error'] = error
        else:
            stored_docs[doc_id].pop('indexing_error', None)
        with open(pkl_name, "wb") as f:
            pickle.dump(stored_docs, f)


def background_index_document(doc_id, owner_id):
    """Background task to fully index an ultra-fast processed document."""
    global stored_docs, index
    
    doc_info = _owned_doc(doc_id, owner_id)
    if doc_info is None:
        print(f"Document {doc_id} not found for background indexing")
        return False
    
    # Skip if already indexed
    if doc_info.get('indexed', False):
        print(f"Document {doc_id} already indexed")
        return True
    
    try:
        print(f"Starting background indexing for document: {doc_id}")
        _set_indexing_status(doc_id, "indexing")
        file_path = doc_info.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            print(f"File not found for background indexing: {file_path}")
            _set_indexing_status(doc_id, "failed", f"File not found: {file_path}")
            return False
        
        # Use fast mode for background indexing (good balance of speed and quality).
        # The original file is kept so it can be reused from My Documents.
        result = insert_into_index(file_path, doc_id, processing_mode="fast",
                                   owner_id=owner_id, file_name=doc_info.get("file_name"))
        
        if result and result.get("success"):
            # Update the stored document to mark as indexed
            with lock:
                stored_docs[doc_id]['indexed'] = True
                stored_docs[doc_id]['indexing_status'] = "indexed"
                stored_docs[doc_id]['background_indexed_timestamp'] = __import__('datetime').datetime.now().isoformat()
                
                with open(pkl_name, "wb") as f:
                    pickle.dump(stored_docs, f)
            
            print(f"✅ Background indexing completed for document: {doc_id}")
            return True
        else:
            print(f"❌ Background indexing failed for document: {doc_id}")
            _set_indexing_status(doc_id, "failed", (result or {}).get("error", "Unknown error"))
            return False
            
    except Exception as e:
        print(f"Error in background indexing for {doc_id}: {str(e)}")
        _set_indexing_status(doc_id, "failed", str(e))
        return False


def process_ultra_fast(doc_file_path, doc_id, start_time, owner_id=None, file_name=None):
    """Ultra-fast processing that stores document info without full indexing.
    
    This mode:
    - Stores document metadata immediately for chat availability
    - Defers expensive embedding/indexing operations
    - Returns success quickly for immediate chat functionality
    """
    global stored_docs
    
    try:
        # Get basic file info quickly
        file_extension = os.path.splitext(doc_file_path)[1].lower()
        file_size = os.path.getsize(doc_file_path) if os.path.exists(doc_file_path) else 0
        
        # Generate a simple document ID if not provided
        if doc_id is None:
            doc_id = f"doc_{int(__import__('time').time() * 1000)}"
        
        # Read the full text of the document (all pages), plus a short preview
        preview_text = ""
        page_count = None
        try:
            if file_extension == '.pdf':
                # PyMuPDFReader returns one Document per page; join them all,
                # tagging each with its page number so page-specific questions work
                reader = PyMuPDFReader()
                documents = reader.load_data(doc_file_path)
                if documents:
                    full_text = "\n\n".join(
                        f"[Page {d.metadata.get('source', i + 1)}]\n{d.text}"
                        for i, d in enumerate(documents)
                    )
                    preview_text = full_text[:2000] + "..." if len(full_text) > 2000 else full_text
                    page_count = len(documents)
                    actual_doc_id = doc_id or documents[0].id_
            else:
                # Quick text file preview
                with open(doc_file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    full_text = f.read()
                    preview_text = full_text[:2000] + "..." if len(full_text) > 2000 else full_text
                actual_doc_id = doc_id
        except Exception as e:
            print(f"Warning: Could not read document preview: {e}")
            preview_text = f"Document: {os.path.basename(doc_file_path)}\nType: {file_extension}\nSize: {file_size} bytes"
            full_text = preview_text
            actual_doc_id = doc_id
        
        # Store document info immediately (without indexing)
        with lock:
            stored_docs[actual_doc_id] = {
                "document_summary": {
                    "title": os.path.basename(doc_file_path),
                    "content_preview": preview_text,
                    "statistics": {
                        "total_characters": len(full_text) if 'full_text' in locals() else len(preview_text),
                        "estimated_pages": page_count or (max(1, len(full_text) // 2000) if 'full_text' in locals() else 1),
                    }
                },
                "full_text": full_text if 'full_text' in locals() else preview_text,
                "full_text_length": len(full_text) if 'full_text' in locals() else len(preview_text),
                "file_size": file_size,
                "metadata": {"source": doc_file_path, "file_type": file_extension},
                "file_type": file_extension,
                "file_path": doc_file_path,
                "processing_timestamp": __import__('datetime').datetime.now().isoformat(),
                "processing_time": __import__('time').time() - start_time,
                "processing_mode": "ultra-fast",
                "owner_id": owner_id,
                "file_name": file_name or os.path.basename(doc_file_path),
                "indexed": False,  # Mark as not yet indexed
                "status": "ready_for_chat"  # Available for basic chat
            }
            
            # Save immediately
            with open(pkl_name, "wb") as f:
                pickle.dump(stored_docs, f)
        
        total_time = __import__('time').time() - start_time
        print(f"⚡ Ultra-fast processing completed in {total_time:.2f}s")
        print(f"   - Document ID: {actual_doc_id}")
        print(f"   - Ready for basic chat (full indexing can be done later)")
        
        return {
            "success": True,
            "doc_id": actual_doc_id,
            "processing_time": total_time,
            "processing_mode": "ultra-fast",
            "status": "ready_for_chat",
            "message": "Document ready for chat! Full indexing will be done in background."
        }
        
    except Exception as e:
        print(f"Error in ultra-fast processing: {str(e)}")
        return {"error": f"Ultra-fast processing failed: {str(e)}"}


def process_documents_fast(documents, pipeline_components, doc_id=None):
    """Fast document processing without expensive LLM calls."""
    processed_nodes = []
    sentence_splitter = pipeline_components["sentence_splitter"]
    token_splitter = pipeline_components["token_splitter"]
    
    for document in documents:
        if doc_id is not None:
            document.id_ = doc_id
            # Ensure document metadata includes doc_id for filtering
            if not hasattr(document, 'metadata'):
                document.metadata = {}
            document.metadata['doc_id'] = doc_id
        
        try:
            # Use sentence splitter first (fast)
            nodes = sentence_splitter.get_nodes_from_documents([document])
            # Ensure all nodes have the doc_id in metadata
            for node in nodes:
                if not hasattr(node, 'metadata'):
                    node.metadata = {}
                node.metadata['doc_id'] = document.id_
            processed_nodes.extend(nodes)
            print(f"Used fast sentence chunking for document: {document.id_}")
            
        except Exception as e:
            print(f"Sentence chunking failed, using token splitting: {e}")
            # Fallback to token splitter
            nodes = token_splitter.get_nodes_from_documents([document])
            # Ensure all nodes have the doc_id in metadata
            for node in nodes:
                if not hasattr(node, 'metadata'):
                    node.metadata = {}
                node.metadata['doc_id'] = document.id_
            processed_nodes.extend(nodes)
            print(f"Used token chunking for document: {document.id_}")
    
    return processed_nodes


def process_documents_enhanced(documents, pipeline_components, doc_id=None):
    """Enhanced document processing with semantic chunking and metadata extraction."""
    processed_nodes = []
    pipeline = pipeline_components["pipeline"]
    
    for document in documents:
        if doc_id is not None:
            document.id_ = doc_id
            # Ensure document metadata includes doc_id for filtering
            if not hasattr(document, 'metadata'):
                document.metadata = {}
            document.metadata['doc_id'] = doc_id
        
        try:
            # Use semantic chunking with metadata extraction (slower but richer)
            nodes = pipeline.run(documents=[document])
            # Ensure all nodes have the doc_id in metadata
            for node in nodes:
                if not hasattr(node, 'metadata'):
                    node.metadata = {}
                node.metadata['doc_id'] = document.id_
            processed_nodes.extend(nodes)
            print(f"✅ Used enhanced semantic chunking for document: {document.id_}")
            
        except Exception as e:
            print(f"Enhanced chunking failed, falling back to fast mode: {e}")
            # Fallback to fast processing
            fast_components = create_fast_chunking_pipeline()
            nodes = process_documents_fast([document], fast_components, doc_id)
            processed_nodes.extend(nodes)
    
    return processed_nodes


def insert_into_index(doc_file_path, doc_id=None, processing_mode="ultra-fast", owner_id=None, file_name=None):
    """Insert new document into global index with optimized chunking.
    
    Args:
        doc_file_path: Path to the document file
        doc_id: Optional document ID
        processing_mode: "ultra-fast" (new default), "fast", or "enhanced"
    """
    global index, stored_docs
    
    start_time = __import__('time').time()
    print(f"Starting document processing in '{processing_mode}' mode...")
    
    try:
        # For ultra-fast mode, minimize PDF processing
        if processing_mode == "ultra-fast":
            return process_ultra_fast(doc_file_path, doc_id, start_time, owner_id, file_name)
        
        # Determine the best reader based on file type
        file_extension = os.path.splitext(doc_file_path)[1].lower()
        
        if file_extension == '.pdf':
            # Use PyMuPDFReader for PDFs - better handling of images and layouts
            reader = PyMuPDFReader()
            documents = reader.load_data(doc_file_path)
        else:
            # Fallback to SimpleDirectoryReader for other file types
            documents = SimpleDirectoryReader(input_files=[doc_file_path]).load_data()
            
        if not documents:
            print(f"No documents loaded from {doc_file_path}")
            return {"error": "No documents found in file"}

        load_time = __import__('time').time()
        print(f"Document loaded in {load_time - start_time:.2f}s")

        # Choose processing strategy based on mode
        if processing_mode == "fast":
            pipeline_components = create_fast_chunking_pipeline()
            processed_nodes = process_documents_fast(documents, pipeline_components, doc_id)
        else:
            pipeline_components = create_enhanced_chunking_pipeline()
            processed_nodes = process_documents_enhanced(documents, pipeline_components, doc_id)

        chunk_time = __import__('time').time()
        print(f"🔧 Document chunked in {chunk_time - load_time:.2f}s ({len(processed_nodes)} nodes)")

        with lock:
            try:
                # Insert processed nodes into the index
                # Use insert_nodes method which is more robust for batch insertion
                index.insert_nodes(processed_nodes)

                index.storage_context.persist(persist_dir=index_name)

                # Create comprehensive document summary
                first_document = documents[0]
                full_text = first_document.text
                document_summary = create_document_summary(full_text, processed_nodes)
                
                # Get the actual file size
                file_size = 0
                try:
                    if os.path.exists(doc_file_path):
                        file_size = os.path.getsize(doc_file_path)
                except Exception as e:
                    print(f"Warning: Could not get file size for {doc_file_path}: {str(e)}")
                
                stored_docs[first_document.id_] = {
                    "document_summary": document_summary,
                    "full_text_length": len(full_text),
                    "file_size": file_size,  # Add actual file size in bytes
                    "metadata": first_document.metadata,
                    "file_type": file_extension,
                    "file_path": doc_file_path,
                    "processing_timestamp": __import__('datetime').datetime.now().isoformat(),
                    "processing_time": chunk_time - start_time,
                    "processing_mode": processing_mode,
                    "owner_id": owner_id,
                    "file_name": file_name or os.path.basename(doc_file_path),
                }

                with open(pkl_name, "wb") as f:
                    pickle.dump(stored_docs, f)
                
                total_time = __import__('time').time() - start_time
                print(f"✅ Successfully processed document in {total_time:.2f}s")
                print(f"   - Document ID: {first_document.id_}")
                print(f"   - Processing mode: {processing_mode}")
                
                return {
                    "success": True, 
                    "doc_id": first_document.id_,
                    "processing_time": total_time,
                    "processing_mode": processing_mode
                }
                
            except Exception as e:
                print(f"Error inserting document into index: {str(e)}")
                return {"error": f"Failed to insert document: {str(e)}"}
                
    except Exception as e:
        print(f"Error loading document {doc_file_path}: {str(e)}")
        return {"error": f"Failed to load document: {str(e)}"}

def _document_text(doc_id):
    """Rebuild a document's text from its indexed chunks for previewing.

    Chunks overlap slightly, so each one is placed by its position in the
    original (start_char_idx) and only the new part is appended. PDF pages are
    kept in order under "--- Page N ---" headings.
    """
    pages = {}
    for node in index.docstore.docs.values():
        if node.metadata.get("doc_id") == doc_id:
            pages.setdefault(str(node.metadata.get("source", "")), []).append(node)

    def page_order(key):
        return (0, int(key)) if key.isdigit() else (1, key)

    sections = []
    for key in sorted(pages, key=page_order):
        nodes = sorted(pages[key], key=lambda n: n.start_char_idx if n.start_char_idx is not None else 0)
        text, last_end = "", None
        for node in nodes:
            start, end = node.start_char_idx, node.end_char_idx
            if start is not None and last_end is not None and start < last_end:
                text += node.text[last_end - start:]
            else:
                text += ("\n" if text else "") + node.text
            if end is not None:
                last_end = max(last_end or 0, end)
        sections.append((key, text.strip()))

    if len(sections) > 1 or (sections and sections[0][0].isdigit()):
        return "\n\n".join(f"--- Page {key} ---\n{text}" for key, text in sections)
    return sections[0][1] if sections else ""


def get_full_document_content(doc_id, owner_id):
    """Get the complete content and analysis of a specific document."""
    global stored_docs, index
    
    if _owned_doc(doc_id, owner_id) is None:
        return {"error": "Document not found"}
    
    doc_info = stored_docs[doc_id]
    
    # Get all nodes for this document from the index
    all_nodes = []
    if hasattr(index, 'docstore') and hasattr(index.docstore, 'docs'):
        for node_id, node in index.docstore.docs.items():
            if hasattr(node, 'ref_doc_id') and node.ref_doc_id == doc_id:
                all_nodes.append({
                    "id": node_id,
                    "text": node.text if hasattr(node, 'text') else str(node),
                    "metadata": node.metadata if hasattr(node, 'metadata') else {}
                })
    
    # Combine all node texts to reconstruct full document
    full_reconstructed_text = "\n\n".join([node["text"] for node in all_nodes])
    
    # Not indexed yet (ultra-fast upload): use the extracted text directly
    preview_text = _document_text(doc_id) or doc_info.get("full_text", "")

    return {
        "doc_id": doc_id,
        "document_info": doc_info,
        "preview_text": preview_text,
        "full_reconstructed_text": full_reconstructed_text,
        "all_nodes": all_nodes,
        "success": True
    }


def get_document_file(doc_id, owner_id):
    """Where owner_id's stored original of a document is, for downloading."""
    doc_info = _owned_doc(doc_id, owner_id)
    if doc_info is None:
        return {"error": "Document not found"}
    file_path = doc_info.get("file_path")
    if not file_path or not os.path.exists(file_path):
        return {"error": "The original file for this document isn't stored. Upload it again to use it here."}
    return {"path": file_path, "file_name": _doc_display_name(doc_info, doc_id)}


def get_documents_list(owner_id):
    """Get owner_id's stored documents with comprehensive metadata."""
    global stored_docs
    documents_list = []
    
    for doc_id, doc_info in stored_docs.items():
        if _owned_doc(doc_id, owner_id) is None:
            continue
        # Handle both old format (string) and new format (dict)
        if isinstance(doc_info, dict):
            # New enhanced format
            if "document_summary" in doc_info:
                summary = doc_info["document_summary"]
                file_path = doc_info.get("file_path") or ""
                documents_list.append({
                    "id": doc_id,
                    "filename": _doc_display_name(doc_info, doc_id),
                    # Whether the original file is stored (older uploads only kept the text)
                    "has_file": bool(file_path) and os.path.exists(file_path),
                    "text": summary.get("content_preview", "")[:500] + "...",
                    "full_document_summary": summary,
                    "statistics": summary.get("statistics", {}),
                    "metadata": doc_info.get("metadata", {}),
                    "file_type": doc_info.get("file_type", "unknown"),
                    "file_path": doc_info.get("file_path", ""),
                    "file_size": doc_info.get("file_size", 0),  # Include actual file size
                    "processing_timestamp": doc_info.get("processing_timestamp", "")
                })
            else:
                # Old enhanced format (before document summary)
                documents_list.append({
                    "id": doc_id, 
                    "text": doc_info.get("text_preview", ""),
                    "metadata": doc_info.get("metadata", {}),
                    "file_type": doc_info.get("file_type", "unknown"),
                    "file_path": doc_info.get("file_path", ""),
                    "file_size": doc_info.get("file_size", 0),  # Include actual file size
                    "processing_timestamp": doc_info.get("processing_timestamp", "")
                })
        else:
            # Backward compatibility with original format
            documents_list.append({
                "id": doc_id, 
                "text": doc_info,
                "metadata": {},
                "file_type": "unknown",
                "file_path": "",
                "processing_timestamp": ""
            })

    return documents_list


def _remove_document_nodes(doc_ids):
    """Delete every chunk belonging to the given document IDs from the index.

    Returns the number of chunks removed. Caller must hold the lock and persist.
    """
    doc_ids = set(doc_ids)
    nodes = [
        node for node in index.docstore.docs.values()
        if node.metadata.get("doc_id") in doc_ids
    ]
    if not nodes:
        return 0

    # Deleting only these chunks (not whole ref docs) keeps other documents'
    # chunks intact; the docstore drops a ref doc's entry once its last chunk goes
    index.delete_nodes([node.node_id for node in nodes], delete_from_docstore=True)
    return len(nodes)


def purge_orphaned_nodes():
    """Remove chunks whose document is no longer in stored_docs (e.g. deleted
    before deletion cleaned up the index), including legacy chunks with no doc_id."""
    with lock:
        orphaned_ids = {
            node.metadata.get("doc_id") for node in index.docstore.docs.values()
        } - set(stored_docs)
        if not orphaned_ids:
            return 0
        removed = _remove_document_nodes(orphaned_ids)
        index.storage_context.persist(persist_dir=index_name)
    print(f"Removed {removed} orphaned chunks (from deleted or pre-account documents)", flush=True)
    return removed


def delete_document(doc_id, owner_id):
    """Delete a document from stored documents and remove all its chunks from the index."""
    global index, stored_docs, lock
    
    with lock:
        try:
            if _owned_doc(doc_id, owner_id) is None:
                return {
                    "error": f"Document with ID '{doc_id}' not found",
                    "success": False
                }
            
            removed_chunks = _remove_document_nodes([doc_id])
            index.storage_context.persist(persist_dir=index_name)

            # Remove any file still waiting for background indexing
            file_path = stored_docs[doc_id].get("file_path")
            if file_path and os.path.exists(file_path):
                os.remove(file_path)

            del stored_docs[doc_id]
            with open(pkl_name, 'wb') as f:
                pickle.dump(stored_docs, f)
            
            return {
                "success": True,
                "message": f"Document '{doc_id}' successfully deleted",
                "doc_id": doc_id,
                "removed_chunks": removed_chunks
            }
            
        except Exception as e:
            return {
                "error": f"Failed to delete document: {str(e)}",
                "success": False
            }


if __name__ == "__main__":
    # init the global index
    print("initializing index...")
    initialize_index()
    purge_orphaned_nodes()
    # Guests' files are kept GUEST_FILE_HOURS, then deleted (checked every 30 min)
    from config import GUEST_FILE_HOURS
    _purge_guest_documents_periodically(GUEST_FILE_HOURS)

    # setup server. The manager protocol uses pickle, so it must only listen on
    # localhost and must require a secret key (generated by start_services.sh)
    authkey = os.environ.get("INDEX_SERVER_AUTHKEY")
    if not authkey:
        raise SystemExit("INDEX_SERVER_AUTHKEY is not set. Start the backend with start_services.sh.")
    manager = BaseManager(("127.0.0.1", int(os.environ.get("INDEX_PORT", "5602"))), authkey.encode())
    manager.register('query_index', query_index)
    manager.register('chat_with_document', chat_with_document)
    manager.register('insert_into_index', insert_into_index)
    manager.register('get_documents_list', get_documents_list)
    manager.register('get_full_document_content', get_full_document_content)
    manager.register('delete_document', delete_document)
    manager.register('background_index_document', background_index_document)
    manager.register('claim_unowned_documents', claim_unowned_documents)
    manager.register('get_document_file', get_document_file)
    manager.register('ping', ping)
    manager.register('claim_guest_documents', claim_guest_documents)
    server = manager.get_server()

    print("server started...")
    server.serve_forever()