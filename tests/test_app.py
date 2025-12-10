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


def test_group_summary_api(client):
    # 16384 bits -> 2 KB groups (8192 bits each)
    payload = { 'value': '16384', 'mode': 'bitcount' }
    res = client.post('/api/group_summary', json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data['group_count'] == 2
    assert len(data['kb_fractions']) == 2
    assert data['kb_fractions'][0] == 1.0 and data['kb_fractions'][1] == 1.0
