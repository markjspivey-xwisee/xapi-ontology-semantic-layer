"""Compatibility launch path; implementation lives in the importable package."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from rest_api.ref_impl.server import SimpleXAPIServer, run  # noqa: E402,F401

if __name__ == '__main__':
    run()
