# Storage ideas (not implemented)

Design notes for a larger or shared binding-backed store. Nothing here is deployed.

## Shared Storage Design Notes

If this becomes a Minify upstream feature, Minify should own allocation instead
of letting each mod claim random keys.

Example mod manifest:

```json
{
  "storage": {
    "id": "show_mmr",
    "pages": 24,
    "codec": "vlq-delta-v1"
  }
}
```

Example physical layout:

```text
slot3 JOY32 = "MS1:acct=161969812;show_mmr=s1:1-24;probe=s1:25-28;crc=ab12"
slot1 JOY1  = "MS1:show_mmr:01:crc:<payload>"
slot1 JOY2  = "MS1:show_mmr:02:crc:<payload>"
```

Rules for a shared binding-backed store:

- Minify owns page allocation.
- Every mod gets a stable namespace/id.
- Mods never write unallocated binding cells.
- Every page includes storage version, mod id, page number, and checksum.
- Unknown mod pages are ignored, not deleted.
- If the directory corrupts, pages should still be scannable by prefix.

This is still Dota runtime storage. Minify can generate helpers and allocate
pages at patch time, but runtime writes still need an in-Dota writable channel
such as `bindss` plus `writekeybindings`.

## Compression Notes

The current readable format stores repeated absolute timestamps and MMR values.
A compact Show MMR codec can store the same data as deltas:

- Store the first timestamp once.
- Store the first MMR once.
- Store later match times as deltas from the previous match.
- Store MMR changes as signed small integers.
- Add a full MMR checkpoint every 16 or 32 records.
- Encode integers with a small base64url/varint alphabet.

Conceptual data:

```text
t0=1783404065,m0=7657 | dt,chg | dt,chg | dt,chg
```

Actual compact page shape:

```text
MS1:show_mmr:01:k9F:T7q3aFQfB0az9Lx2_mP...
```

Capacity estimates, assuming conservative bind values around 450-500
characters:

- Current readable slot3-only storage: newest 100 records.
- Compressed slot3-only storage: about 1,500-2,500 records.
- Compressed slot1-slot3 storage: about 4,500-7,000 records.
- More may be possible, but should not be promised without stress-testing Dota
  bind string truncation and `LoadKeyValues` behavior.

The practical target for a shared storage layer should be about 5,000 records
per account before requiring external tooling or a different persistence
channel.
