"""Smoke-test the server over real stdio, exactly as an MCP client would.

Spawns `python server.py` as a subprocess and exercises the full surface:
initialize -> tools/list -> tools/call read (default + word_count=10)
-> resources/read lorem://words/5. Prints each result; exits non-zero on
any mismatch. Used to produce the verification transcript in ../docs/.
"""

import asyncio
import sys
from pathlib import Path

from fastmcp import Client

SERVER = Path(__file__).parent.parent / "server.py"


async def main() -> None:
    async with Client(SERVER) as client:
        print(f"$ python server.py  (spawned over stdio by the MCP client)\n")

        tools = await client.list_tools()
        print(f"tools/list        -> {[t.name for t in tools]}")

        default = await client.call_tool("read", {})
        n = len(default.data.split())
        print(f'tools/call read {{}}                 -> {n} words')
        print(f'   "{default.data[:70]}..."')
        assert n == 30, f"expected 30 words, got {n}"

        ten = await client.call_tool("read", {"word_count": 10})
        print(f'tools/call read {{"word_count": 10}} -> {len(ten.data.split())} words')
        print(f'   "{ten.data}"')
        assert len(ten.data.split()) == 10

        res = await client.read_resource("lorem://words/5")
        print(f'resources/read lorem://words/5     -> "{res[0].text}"')
        assert len(res[0].text.split()) == 5

        print("\nOK: resource and read tool both return word-limited content")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as exc:
        print(f"FAILED: {exc}")
        sys.exit(1)
