"""Folders in the Document Manager: organizing documents and signature requests."""

import io
import json

import pytest

import config


def _upload(user_client, name="lease.pdf"):
    response = user_client.post(
        "/uploadFile",
        data={"file": (io.BytesIO(b"%PDF-1.4 test"), name), "processing_mode": "fast"},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200, response.get_json()
    return response.get_json()["doc_id"]


def _folder(user_client, name, parent_id=None):
    response = user_client.post("/folders", json={"name": name, "parent_id": parent_id})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["folder"]


def _documents(user_client):
    return {doc["id"]: doc for doc in user_client.get("/getDocuments").get_json()}


def _folders(user_client):
    return {f["name"]: f for f in user_client.get("/folders").get_json()["folders"]}


def _request(user_client, make_pdf, folder_id=None):
    data = {"title": "Lease", "signers": [{"name": "Alex", "email": "alex@example.com"}],
            "fields": [{"signer": 0, "kind": "signature", "page": 0, "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.05}],
            "folder_id": folder_id}
    with open(make_pdf(pages=1), "rb") as f:
        return user_client.post("/signature-requests", data={"file": (f, "lease.pdf"), "data": json.dumps(data)},
                                content_type="multipart/form-data")


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")


def test_create_and_list_folders(signup):
    user_client = signup()
    willow = _folder(user_client, "  214 Willow   Lane ")
    assert willow["name"] == "214 Willow Lane"  # spaces tidied
    _folder(user_client, "Leases", parent_id=willow["id"])
    folders = _folders(user_client)
    assert set(folders) == {"214 Willow Lane", "Leases"}
    assert folders["Leases"]["parent_id"] == willow["id"]
    assert folders["214 Willow Lane"]["document_count"] == 0


@pytest.mark.parametrize("body,status,message", [
    ({"name": ""}, 400, "Give the folder a name"),
    ({"name": "x" * 81}, 400, "up to 80 characters"),
    ({"name": "Deals", "parent_id": "nope"}, 404, "doesn't exist"),
])
def test_folder_names_are_checked(signup, body, status, message):
    response = signup().post("/folders", json=body)
    assert response.status_code == status
    assert message in response.get_json()["error"]


def test_names_are_unique_within_a_folder_and_only_one_level_deep(signup):
    user_client = signup()
    deals = _folder(user_client, "Deals")
    duplicate = user_client.post("/folders", json={"name": "DEALS"})
    assert duplicate.status_code == 409
    sub = _folder(user_client, "Deals", parent_id=deals["id"])  # same name, different level: fine
    too_deep = user_client.post("/folders", json={"name": "More", "parent_id": sub["id"]})
    assert too_deep.status_code == 400
    assert "one level deep" in too_deep.get_json()["error"]


def test_rename(signup):
    user_client = signup()
    folder = _folder(user_client, "Old")
    _folder(user_client, "Taken")
    assert user_client.patch(f"/folders/{folder['id']}", json={"name": "Taken"}).status_code == 409
    assert user_client.patch(f"/folders/{folder['id']}", json={"name": "New"}).get_json()["folder"]["name"] == "New"
    assert set(_folders(user_client)) == {"New", "Taken"}


def test_moving_documents_into_and_out_of_folders(signup, index_server):
    user_client = signup()
    doc_id = _upload(user_client)
    other = _upload(user_client, "other.pdf")
    folder = _folder(user_client, "214 Willow Lane")
    assert _documents(user_client)[doc_id]["folder_id"] is None

    moved = user_client.post("/folders/move", json={"folder_id": folder["id"], "document_ids": [doc_id]})
    assert moved.get_json() == {"moved": 1, "folder_id": folder["id"]}
    documents = _documents(user_client)
    assert documents[doc_id]["folder_id"] == folder["id"]
    assert documents[other]["folder_id"] is None
    assert _folders(user_client)["214 Willow Lane"]["document_count"] == 1

    # Back out of any folder
    user_client.post("/folders/move", json={"folder_id": None, "document_ids": [doc_id]})
    assert _documents(user_client)[doc_id]["folder_id"] is None


def test_deleting_a_document_takes_it_out_of_its_folder(signup):
    user_client = signup()
    doc_id = _upload(user_client)
    folder = _folder(user_client, "Deals")
    user_client.post("/folders/move", json={"folder_id": folder["id"], "document_ids": [doc_id]})
    assert user_client.delete(f"/documents/{doc_id}").status_code == 200
    assert _folders(user_client)["Deals"]["document_count"] == 0


def test_deleting_a_folder_keeps_everything_in_it(signup, make_pdf):
    user_client = signup()
    willow = _folder(user_client, "Willow")
    leases = _folder(user_client, "Leases", parent_id=willow["id"])
    _folder(user_client, "Leases")  # clashes with the subfolder once it moves up
    doc_in_sub = _upload(user_client, "a.pdf")
    doc_in_top = _upload(user_client, "b.pdf")
    user_client.post("/folders/move", json={"folder_id": leases["id"], "document_ids": [doc_in_sub]})
    user_client.post("/folders/move", json={"folder_id": willow["id"], "document_ids": [doc_in_top]})
    request_id = _request(user_client, make_pdf, folder_id=leases["id"]).get_json()["request"]["id"]

    # Deleting the subfolder: its contents move up to Willow
    assert user_client.delete(f"/folders/{leases['id']}").get_json() == {"deleted": True}
    assert _documents(user_client)[doc_in_sub]["folder_id"] == willow["id"]
    assert user_client.get(f"/signature-requests/{request_id}").get_json()["request"]["folder_id"] == willow["id"]

    # Deleting a top folder: contents leave folders altogether; subfolders move up (renamed on a clash)
    _folder(user_client, "Leases", parent_id=willow["id"])
    user_client.delete(f"/folders/{willow['id']}")
    documents = _documents(user_client)
    assert documents[doc_in_sub]["folder_id"] is None and documents[doc_in_top]["folder_id"] is None
    assert set(_folders(user_client)) == {"Leases", "Leases (moved)"}
    assert all(f["parent_id"] is None for f in _folders(user_client).values())


def test_signature_requests_can_be_filed_in_folders(signup, make_pdf):
    user_client = signup()
    folder = _folder(user_client, "Willow")
    request_id = _request(user_client, make_pdf, folder_id=folder["id"]).get_json()["request"]["id"]
    listed = user_client.get("/signature-requests").get_json()["requests"]
    assert listed[0]["folder_id"] == folder["id"]
    assert _folders(user_client)["Willow"]["request_count"] == 1

    unfiled = _request(user_client, make_pdf).get_json()["request"]["id"]
    user_client.post("/folders/move", json={"folder_id": folder["id"], "request_ids": [unfiled]})
    assert _folders(user_client)["Willow"]["request_count"] == 2
    assert request_id


def test_a_request_cannot_go_into_someone_elses_folder(signup, make_pdf):
    other_folder = _folder(signup("other@example.com"), "Theirs")
    response = _request(signup("me@example.com"), make_pdf, folder_id=other_folder["id"])
    assert response.status_code == 400


def test_folders_are_private(signup, make_pdf):
    owner = signup("owner@example.com")
    folder = _folder(owner, "Willow")
    doc_id = _upload(owner)
    request_id = _request(owner, make_pdf).get_json()["request"]["id"]
    other = signup("other@example.com")
    assert other.get("/folders").get_json() == {"folders": []}
    assert other.patch(f"/folders/{folder['id']}", json={"name": "Mine"}).status_code == 404
    assert other.delete(f"/folders/{folder['id']}").status_code == 404
    mine = _folder(other, "Mine")
    # Someone else's documents and requests can't be moved, and nothing moves into someone else's folder
    assert other.post("/folders/move", json={"folder_id": mine["id"], "document_ids": [doc_id]}).status_code == 404
    assert other.post("/folders/move", json={"folder_id": mine["id"], "request_ids": [request_id]}).status_code == 404
    assert other.post("/folders/move", json={"folder_id": folder["id"], "document_ids": []}).status_code == 404


def test_guests_have_no_folders(client):
    assert client.get("/folders").status_code == 401
    assert client.post("/folders", json={"name": "x"}).status_code == 401


# --- the Signature requests folder ---------------------------------------------------------

def test_requests_go_in_a_signature_requests_folder_unless_another_is_chosen(signup, make_pdf):
    user = signup()
    first = _request(user, make_pdf)
    assert first.status_code in (200, 201), first.get_json()
    assert _request(user, make_pdf).status_code in (200, 201)
    folders = _folders(user)
    # Made once, at the top level, holding both requests
    assert list(folders) == ["Signature requests"]
    assert folders["Signature requests"]["parent_id"] is None
    assert folders["Signature requests"]["request_count"] == 2

    # A chosen folder is used instead
    deals = _folder(user, "Deals")
    assert _request(user, make_pdf, folder_id=deals["id"]).status_code in (200, 201)
    folders = _folders(user)
    assert folders["Deals"]["request_count"] == 1
    assert folders["Signature requests"]["request_count"] == 2


def test_an_existing_folder_with_that_name_is_used(signup, make_pdf):
    user = signup()
    mine = _folder(user, "signature requests")
    assert _request(user, make_pdf).status_code in (200, 201)
    folders = _folders(user)
    assert list(folders) == ["signature requests"]
    assert folders["signature requests"]["id"] == mine["id"]
    assert folders["signature requests"]["request_count"] == 1


def test_requests_sent_before_the_folder_existed_move_into_it_once(signup, make_pdf):
    import db
    import folders as folders_module

    user = signup()
    assert _request(user, make_pdf).status_code in (200, 201)
    # As it was before: the request in no folder, no folder, and the move not yet done
    with db.connect_db() as conn:
        conn.execute("UPDATE signature_requests SET folder_id = NULL")
        conn.execute("DELETE FROM folders")
        conn.execute("DELETE FROM app_migrations")

    folders_module.init_folders()
    assert _folders(user)["Signature requests"]["request_count"] == 1

    # Only once: a request moved out of the folder later (e.g. the folder was
    # deleted) isn't put back on the next restart
    with db.connect_db() as conn:
        conn.execute("UPDATE signature_requests SET folder_id = NULL")
    folders_module.init_folders()
    assert _folders(user)["Signature requests"]["request_count"] == 0
