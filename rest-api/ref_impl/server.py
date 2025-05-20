import json
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

class SimpleXAPIServer(BaseHTTPRequestHandler):
    statements = []
    activities = []
    agents = []
    verbs = []

    def _send_json(self, status, body, headers=None):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/':
            body = {
                "_links": {
                    "self": {"href": "/"},
                    "statements": {"href": "/statements"},
                    "activities": {"href": "/activities"},
                    "agents": {"href": "/agents"},
                    "verbs": {"href": "/verbs"}
                },
                "version": "1.0.0",
                "documentation": "/docs"
            }
            self._send_json(200, body)
        elif path == '/statements':
            self._send_json(200, SimpleXAPIServer.statements)
        elif path.startswith('/statements/'):
            sid = path.split('/')[-1]
            stmt = next((s for s in SimpleXAPIServer.statements if s.get('id') == sid), None)
            if stmt:
                self._send_json(200, stmt)
            else:
                self._send_json(404, {"error": "Statement not found"})
        elif path == '/activities':
            self._send_json(200, SimpleXAPIServer.activities)
        elif path.startswith('/activities/'):
            aid = path.split('/')[-1]
            act = next((a for a in SimpleXAPIServer.activities if a.get('id') == aid), None)
            if act:
                self._send_json(200, act)
            else:
                self._send_json(404, {"error": "Activity not found"})
        elif path == '/agents':
            self._send_json(200, SimpleXAPIServer.agents)
        elif path.startswith('/agents/'):
            agid = path.split('/')[-1]
            ag = next((a for a in SimpleXAPIServer.agents if a.get('id') == agid), None)
            if ag:
                self._send_json(200, ag)
            else:
                self._send_json(404, {"error": "Agent not found"})
        elif path == '/verbs':
            self._send_json(200, SimpleXAPIServer.verbs)
        elif path.startswith('/verbs/'):
            vid = path.split('/')[-1]
            vb = next((v for v in SimpleXAPIServer.verbs if v.get('id') == vid), None)
            if vb:
                self._send_json(200, vb)
            else:
                self._send_json(404, {"error": "Verb not found"})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(content_length)
        try:
            body = json.loads(data.decode('utf-8')) if data else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        if path == '/statements':
            if 'id' not in body:
                body['id'] = str(uuid.uuid4())
            SimpleXAPIServer.statements.append(body)
            self._send_json(201, {"id": body['id']}, headers={'Location': f"/statements/{body['id']}"})
        elif path == '/activities':
            if 'id' not in body:
                self._send_json(400, {"error": "Activity requires id"})
                return
            SimpleXAPIServer.activities.append(body)
            self._send_json(201, body, headers={'Location': f"/activities/{body['id']}"})
        elif path == '/agents':
            if 'id' not in body:
                self._send_json(400, {"error": "Agent requires id"})
                return
            SimpleXAPIServer.agents.append(body)
            self._send_json(201, body, headers={'Location': f"/agents/{body['id']}"})
        elif path == '/verbs':
            if 'id' not in body:
                self._send_json(400, {"error": "Verb requires id"})
                return
            SimpleXAPIServer.verbs.append(body)
            self._send_json(201, body, headers={'Location': f"/verbs/{body['id']}"})
        else:
            self._send_json(404, {"error": "Not found"})

def run(server_class=HTTPServer, handler_class=SimpleXAPIServer, port=8000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting xAPI reference server on port {port}...")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
