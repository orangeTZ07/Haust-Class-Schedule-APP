#!/usr/bin/env python3
"""Verify that an unsigned iOS IPA contains Payload/<AppName>.app/Info.plist."""
import sys
import zipfile

def main():
    if len(sys.argv) < 2:
        print("Usage: verify-ios-ipa.py <path-to-ipa>", file=sys.stderr)
        sys.exit(1)

    ipa_path = sys.argv[1]
    with zipfile.ZipFile(ipa_path, "r") as z:
        names = z.namelist()
        has_plist = any(n.startswith("Payload/") and n.endswith(".app/Info.plist") for n in names)
        if not has_plist:
            print(f"::error::{ipa_path} has no Payload/*.app/Info.plist; contents:", file=sys.stderr)
            for name in names[:40]:
                print(f"  {name}", file=sys.stderr)
            sys.exit(1)
    print(f"Verified IPA contents for {ipa_path}: Info.plist found.")

if __name__ == "__main__":
    main()
