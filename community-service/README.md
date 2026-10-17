# StormVector community photo service

This Worker is the shared upload service used by StormVector's Community Photos tab. The frontend stays on GitHub Pages. Photos and their capture metadata are stored together in R2 object storage; preferences and removal receipts alone stay in browser storage.

Endpoint: https://stormvector-community-borden.robustapple32.chatgpt.site

- `GET /api/health` reports whether storage is bound.
- `GET /api/photos` lists up to 100 photos with an opaque pagination cursor. Public records include event type, selected coordinates, location name, camera/phone, capture timestamp and time zone, submission timestamp, optional display name, title and caption. Removal secrets are omitted.
- `POST /api/photos` accepts an image and metadata using multipart form data. The StormVector page resizes and recompresses to JPEG, removing embedded EXIF/GPS metadata. The server validates image signatures, capture dates, coordinates, consent, and a 4 MB upload cap. Uploads are public immediately. A best-effort per-IP limit of six uploads per hour reduces casual spam; it is not a comprehensive anti-abuse service.
- `GET /api/media/:key` serves uploaded image bytes with a constrained image content type.
- `DELETE /api/photos` removes an upload only with the secret receipt returned to its submitting browser. The public list never contains that receipt.

Writes accept requests from the public StormVector origin, `https://bsborden96.github.io`. CORS is not authentication. Photos are public community contributions, not verified nature observations. The current service has no moderation dashboard or contributor accounts.

The backend is deployed using Sites. Preserve the exact identity in `.openai/hosting.json`; R2 binding `BUCKET` is provisioned during publication. Run `npm test` for validation and the upload/list/media/removal flow. The supplied build and artifact validator create a deterministic Worker artifact without dependencies. Source in this folder matches the deployed service source; future edits must also be pushed and published through Sites.

## Community accounts

`/account` provides email/password sign-up and sign-in, public member profiles, opt-in private messages, photo likes, and signed-in photo ownership. No ChatGPT account is required. Passwords use salted PBKDF2; only hashed session tokens are stored. Sessions use HttpOnly, Secure, SameSite=Lax cookies and expire after 30 days. Account writes require a same-origin request. Request identity headers are not used for these accounts.

Save the one-time recovery code after signup or password reset. Recovery rotates the code and revokes earlier sessions. Transactional email is not configured: email ownership is unverified and email reset links are unavailable. The interface states this explicitly. Profiles never expose account email addresses or authentication records.

Photos uploaded through `/account` are linked to the signed-in profile, with removal authorized by the server across devices. Earlier anonymous uploads retain their original removal receipts. Incoming messages are disabled until the member enables them. Inbox results include only that account's messages (latest 100); likes are idempotent per account and photo. Account and message storage shares the existing BUCKET binding under separate prefixes.

Photo metadata now includes the selected region: WI, MN, MI or UP. Older uploads without region retain compatibility; the guide only infers their region when a curated location is within 25 miles.
