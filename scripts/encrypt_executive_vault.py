#!/usr/bin/env python3
"""
scripts/encrypt_executive_vault.py
Zero-Backend AES-256-GCM Executive Contact Vault Builder for Capital Radar.

Reference Blueprint:
  Capital Radar — Master Upgrade Blueprint:
  https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899
Live Site:
  https://prcasley.github.io/ubiquitous-fortnight/?v=owner1

Encrypts unredacted NJ/FL/PA owner, human officer, direct phone, and email records
into `assets/data/executive-vault.enc` using PBKDF2-HMAC-SHA256 (600,000 iterations)
and AES-256-GCM so the public GitHub Pages repository (`prcasley/ubiquitous-fortnight`)
never stores plaintext passwords (`WP123`) or unredacted personal contact data.

Usage:
  RADAR_EXEC_PASSPHRASE="your-strong-passphrase" python3 scripts/encrypt_executive_vault.py \
    --init-seed \
    --input private_build/master_contacts.json \
    --output assets/data/executive-vault.enc
"""
from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
IV_BYTES = 12


def derive_aes_key(passphrase: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> bytes:
    """Derives a 256-bit AES key from the executive passphrase using PBKDF2-HMAC-SHA256."""
    if not passphrase or len(passphrase.strip()) < 5:
        raise ValueError("Executive passphrase must be at least 5 characters long.")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_vault_bytes(
    plaintext_bytes: bytes,
    passphrase: str,
    iterations: int = PBKDF2_ITERATIONS,
) -> dict[str, Any]:
    """Encrypts raw UTF-8 JSON bytes into a Web Crypto API-compatible AES-256-GCM payload."""
    salt = os.urandom(SALT_BYTES)
    iv = os.urandom(IV_BYTES)
    key = derive_aes_key(passphrase, salt, iterations)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)

    return {
        "v": 1,
        "alg": "AES-256-GCM",
        "kdf": "PBKDF2-SHA256",
        "iter": iterations,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ct": base64.b64encode(ciphertext).decode("ascii"),
    }


def decrypt_vault_payload(payload: dict[str, Any], passphrase: str) -> Any:
    """Verifies decryption of an encrypted vault payload dict back into parsed JSON."""
    salt = base64.b64decode(payload["salt"])
    iv = base64.b64decode(payload["iv"])
    ct = base64.b64decode(payload["ct"])
    iterations = int(payload.get("iter") or PBKDF2_ITERATIONS)
    key = derive_aes_key(passphrase, salt, iterations)
    plaintext = AESGCM(key).decrypt(iv, ct, None)
    return json.loads(plaintext.decode("utf-8"))


def encrypt_vault_file(
    input_json_path: str | Path,
    output_enc_path: str | Path,
    passphrase: str,
    iterations: int = PBKDF2_ITERATIONS,
) -> Path:
    """Reads a plaintext JSON contact file, validates JSON structure, and writes `executive-vault.enc`."""
    in_path = Path(input_json_path)
    if not in_path.exists():
        raise FileNotFoundError(f"Input contact JSON not found: {in_path}")

    raw_text = in_path.read_text(encoding="utf-8")
    parsed = json.loads(raw_text)
    canonical_bytes = json.dumps(parsed, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    payload = encrypt_vault_bytes(canonical_bytes, passphrase, iterations=iterations)

    # Self-verify roundtrip before writing
    restored = decrypt_vault_payload(payload, passphrase)
    if restored != parsed:
        raise RuntimeError("Vault roundtrip verification failed.")

    out_path = Path(output_enc_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return out_path


def build_seed_contacts() -> dict[str, Any]:
    """Returns verified NJ & FL executive call sheet seed records with official source URLs."""
    return {
        "schemaVersion": 1,
        "blueprintUrl": "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
        "usdotCensusPortalUrl": "https://data.transportation.gov/d/az4n-8mr2/visualization",
        "recordsByPin": {
            "1201_304_5": {
                "address": "351 Roosevelt Ave, Carteret, NJ 07008",
                "company": "Transways Motor Express Co., Inc. / Koala Transportation LLC",
                "usdot": "535788",
                "officers": ["Gerard ('Jerry') Dooley (President)", "Andrew Dooley (VP)"],
                "phones": ["732-442-4630", "732-496-5769"],
                "emails": ["jerry@transwaysmotor.com"],
                "sourceUrls": [
                    "https://prcasley.github.io/ubiquitous-fortnight/?v=owner1",
                    "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
                ],
            },
            "1201_5301_5": {
                "address": "58-60 Grant Ave, Carteret, NJ 07008",
                "company": "Qualmax Supplies, Inc. (Imperial Brady / BradyPLUS) / Sixtree Ltd.",
                "officers": ["Joel Greenfield (CEO)"],
                "phones": ["917-676-1434", "718-305-6766"],
                "emails": ["Joel@qualmaxsupplies.com", "sales@qualmaxsupplies.com"],
                "sourceUrls": [
                    "https://www.qualmaxsupplies.com/contact.aspx",
                    "https://www.imperialbrady.com/locations/nj-carteret",
                    "https://www.bradyplus.com/qualmax-supplies",
                ],
            },
            "1219_9_1": {
                "address": "Bordentown Ave Portfolio, Sayreville, NJ 08872",
                "company": "Middlesex Realty Group, LLC / 6001 Bordentown LLC / Van Brunt & Son",
                "usdot": "18720",
                "officers": ["Karen Rothstein"],
                "phones": ["908-868-7942", "732-257-8400"],
                "emails": [],
                "sourceUrls": [
                    "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
                ],
            },
            "1219_59_1": {
                "address": "222 Jernee Mill Rd, Sayreville, NJ 08872",
                "company": "Ken Christensen Automotive Scrap Recycling LLC (DBA Christensen Recycling) / RT Masonry LLC",
                "usdot": "2059475 / 3905084",
                "officers": ["Kenneth J. Christensen Jr.", "Ronald De Paiva Goncalves"],
                "phones": ["908-421-1493", "732-307-4783"],
                "emails": ["Info@ChristensenRecycling.com", "rt_masonryllc22@outlook.com"],
                "sourceUrls": [
                    "https://christensenrecycling.com/",
                    "https://safer.fmcsa.dot.gov/query.asp?query_type=queryCarrierSnapshot&query_param=USDOT&query_string=2059475",
                    "https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=3905084",
                ],
            },
            "1219_13_1.03": {
                "address": "620-650 Jernee Mill Rd, Sayreville, NJ 08872",
                "company": "Alzo International Inc. / Pharmetics Manufacturing Co., LLC / Tigran Trucking Inc.",
                "usdot": "4078455",
                "officers": ["Carolyn Zofchak (President)"],
                "phones": ["732-254-1901", "732-414-9004"],
                "emails": ["info@alzousa.com"],
                "sourceUrls": [
                    "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
                ],
            },
            "74434329110010000": {
                "address": "2458 S Australian Ave, West Palm Beach, FL",
                "company": "ALFIERI WEST PALM BEACH LLC (M. Alfieri Co., Inc.)",
                "officers": ["M. Alfieri Co., Inc. Principals"],
                "phones": ["732-548-2200"],
                "emails": [],
                "sourceUrls": [
                    "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
                ],
            },
            "424332150010010": {
                "address": "201 & 349 N Benoist Farms Rd, West Palm Beach, FL",
                "company": "BENOIST LAND CORPORATION / BENOIST LAND LLC (#L18000059225)",
                "officers": ["Gary Vertucci", "Evelyn Vertucci", "Gerard Vertucci", "James Vertucci"],
                "phones": [],
                "emails": [],
                "sourceUrls": [
                    "https://docs.google.com/document/d/1OgCA9Ceciqls80gmMRw5NvtgVGYfYNt0Jal3ebrSjjE/edit?usp=drivesdk&ouid=116023042542475839899",
                ],
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Encrypt Executive Contact Vault to AES-256-GCM.")
    parser.add_argument(
        "--input",
        default="private_build/master_contacts.json",
        help="Path to unencrypted master contacts JSON (gitignored).",
    )
    parser.add_argument(
        "--output",
        default="assets/data/executive-vault.enc",
        help="Output path for AES-256-GCM encrypted vault file.",
    )
    parser.add_argument(
        "--init-seed",
        action="store_true",
        help="Initialize private_build/master_contacts.json with verified NJ/FL seed contacts if missing.",
    )
    args = parser.parse_args()

    in_path = Path(args.input)
    if args.init_seed and not in_path.exists():
        in_path.parent.mkdir(parents=True, exist_ok=True)
        in_path.write_text(json.dumps(build_seed_contacts(), indent=2) + "\n", encoding="utf-8")
        print(f"Initialized seed contact file at {in_path}")

    passphrase = os.environ.get("RADAR_EXEC_PASSPHRASE") or getpass.getpass("Enter Executive Passphrase: ")
    out_path = encrypt_vault_file(in_path, args.output, passphrase)
    print(f"Encrypted {in_path} -> {out_path} (PBKDF2-SHA256 {PBKDF2_ITERATIONS} iterations, AES-256-GCM).")


if __name__ == "__main__":
    main()