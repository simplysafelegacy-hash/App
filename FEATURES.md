# Simply Safe Legacy — Features & Permissions

_Last updated: 2026-08-13_

## Documents & Sections

A vault has **seven sections**, all gated by the same permission engine.

**Legal documents** (single records):

- Will
- Power of attorney
- Health care directive

**Lists & records:**

- Personal property
- Non-probate assets
- Funeral & burial wishes
- Important contacts

Only the **vault owner** can add, edit, or remove content in any section.

## Proof-based release (legal documents only)

The proof-based release flow applies **only to the three legal documents** (will,
power of attorney, health care directive) — *not* to the list/record sections.

If the owner has recorded one of these documents, a person with a delayed
permission on it can upload proof that the owner is dead or incapacitated:

- **Will** → proof of **death** (e.g. death certificate).
- **Power of attorney / Health care directive** → proof of **incapacity**
  (e.g. physician certifications).

An admin reviews the uploaded proof and releases that document's access if
warranted. A person can only submit a release request for a document that is
recorded and not yet released.

Each submission may include **up to 3 proof files**, and each person may make
**up to 3 submissions per document**. The remaining count ("N of 3 submissions
left") is shown on the document. Anyone with access to a document (owner,
steward, successor, agent) can see how many submissions have been made against
it and each submission's review status (under review / approved / rejected).

## Permissions

When the owner grants a person access to a section, they choose an access model
that depends on the section:

- **Will and the list sections** (personal property, non-probate assets,
  funeral & burial, contacts) use the **steward / successor** model:
  - **Steward** — active access **now**.
  - **Successor** — access **after death**, once the vault (or that document) is
    released.
  - A person can be one or the other for a given section, not both.
- **Power of attorney** uses the **Power of Attorney Agent** role; **health care
  directive** uses the **Health Care Proxy** role. Each can be granted access
  **now** or **after incapacity** is verified.

Permissions are **per-section** and independent — being granted the will does not
grant the lists, and vice versa.

**Hiding (keep someone in the dark until release):** when granting a permission,
the owner can mark it **hidden**. Hiding is designed to pair with a *delayed*
(after-death / after-incapacity) permission, for cases where the owner wants to
name someone without telling them — e.g. a successor who shouldn't know the
arrangement exists, or a "break glass in emergency" agent who shouldn't be
looking at the owner's affairs while the owner is well.

A hidden permission does two things:

- **Blocks reading** that section's content — the person can't see it regardless
  of their role.
- **Masks the vault's identity** — but *only* when **every** permission that
  person holds on the vault is hidden. In that case the vault shows to them as
  "Sealed vault" with owner "Vault owner" and no email; they can tell they've
  been given some access, but not what vault it is or whose. If they also hold
  any non-hidden permission, the real name and owner are visible.

Concealment lifts automatically on **release**: once the relevant document is
released (or the whole vault is released), a hidden after-death/after-incapacity
permission becomes readable and the identity is revealed. So "hidden" means
"stay dark until release," not "permanently blocked."

## Important Contacts, Funeral & Burial Wishes, Non-Probate Assets, Personal Property

These four list/record sections all work the same way:

- Only the **vault owner** can add, edit, and remove entries.
- Access is granted per-section via a **steward (now)** or **successor (after
  death)** permission, exactly like the will.
- They do **not** participate in the proof-based release / admin-review flow —
  access is governed purely by the permission's timing and the vault's release
  state.
