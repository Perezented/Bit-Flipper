import pytest
from app import app as flask_app


@pytest.fixture
def client():
    flask_app.testing = True
    with flask_app.test_client() as client:
        yield client


def test_index_loads(client):
    res = client.get('/')
    assert res.status_code == 200
    assert b'Bit Flipper' in res.data
