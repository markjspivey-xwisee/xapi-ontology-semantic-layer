import json
import threading
import time
import unittest
from urllib.request import urlopen, Request
from rest_api.ref_impl import server

PORT = 8099

class ServerTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.thread = threading.Thread(target=server.run, kwargs={'port': PORT}, daemon=True)
        cls.thread.start()
        time.sleep(0.5)

    def test_root_endpoint(self):
        with urlopen(f'http://localhost:{PORT}/') as resp:
            data = json.load(resp)
        self.assertIn('statements', data['_links'])

    def test_post_and_get_statement(self):
        stmt = {'actor': {'name': 'Alice'}, 'verb': 'did', 'object': 'test'}
        req = Request(
            f'http://localhost:{PORT}/statements',
            data=json.dumps(stmt).encode('utf-8'),
            method='POST',
            headers={'Content-Type': 'application/json'}
        )
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 201)
            created = json.load(resp)
        sid = created['id']
        with urlopen(f'http://localhost:{PORT}/statements/{sid}') as resp:
            returned = json.load(resp)
        self.assertEqual(returned['id'], sid)

if __name__ == '__main__':
    unittest.main()
