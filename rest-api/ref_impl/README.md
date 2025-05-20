# xAPI Reference Server

This directory contains a minimal reference implementation of the REST API
described by `../openapi.yaml`. The server is intentionally lightweight and
relies only on Python's standard library so it can run in restricted
environments without installing additional dependencies.

## Running the server

```bash
python3 server.py
```

By default the server listens on port 8000. It maintains all data in memory so
any stored items will be lost when the process stops.

## Implemented endpoints

* `GET /` – API root with hypermedia links
* `GET /statements` – list stored statements
* `POST /statements` – store a new statement (UUID generated if missing)
* `GET /statements/{id}` – retrieve a single statement
* Similar endpoints exist for `activities`, `agents`, and `verbs`.

This implementation only covers a tiny subset of the full specification but
serves as a starting point for experimentation and testing.
