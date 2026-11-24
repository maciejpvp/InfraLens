# InfraLens workflow cost assumptions

Pass one UTF-8 JSON object of at most 1 MiB to `--costs --cost-assumptions FILE`.
Write version 2 with semantic `usage` meters. InfraLens translates the usage into
AWS billing dimensions and prices from the infrastructure snapshot and AWS Price List.
Existing v1 overrides and v2 files with explicit `rate` selectors remain readable.

```json
{
  "version": 2,
  "scenario": "Profile photo replacement including thumbnail creation",
  "workflows": [{
    "id": "user-profile-pic-change",
    "label": "UserProfilePicChange",
    "after": {
      "runsPerUser": 1,
      "frequencyEvidence": "Budget estimate of one upload per active user-month. Profile settings expose this as an optional action (app/profile/Edit.tsx:41).",
      "steps": [
        { "id": "api", "label": "POST /profile/photo", "resource": { "id": "profile-api" },
          "meters": [{ "label": "API calls", "usage": "requests", "quantity": 1 }] },
        { "id": "handler", "label": "Upload avatar", "resource": { "id": "upload-handler" },
          "meters": [
            { "label": "Invocations", "usage": "lambdaInvocations", "quantity": 1 },
            { "label": "Duration", "usage": "lambdaMs", "quantity": 250, "evidence": ["bench/avatar.json"] }
          ] },
        { "id": "original", "label": "Store original", "resource": { "id": "avatars-bucket" },
          "meters": [
            { "label": "Object writes", "usage": "s3Put", "quantity": 1 },
            { "label": "JPEG payload", "usage": "s3UploadBytes", "quantity": 786432, "evidence": ["app/profile/compress.ts:29"] }
          ] },
        { "id": "processor", "label": "Build thumbnail", "resource": { "id": "thumbnail-handler" },
          "meters": [
            { "label": "Invocations", "usage": "lambdaInvocations", "quantity": 1 },
            { "label": "Duration", "usage": "lambdaMs", "quantity": 300, "evidence": ["bench/avatar.json"] }
          ] },
        { "id": "read-original", "label": "Read original for thumbnail", "resource": { "id": "avatars-bucket" },
          "meters": [{ "label": "Object reads", "usage": "s3Get", "quantity": 1 }] },
        { "id": "thumbnail", "label": "Write thumbnail", "resource": { "id": "avatars-bucket" },
          "meters": [{ "label": "Object writes", "usage": "s3Put", "quantity": 1 }] },
        { "id": "profile", "label": "Update profile", "resource": { "id": "profiles-table" },
          "meters": [
            { "label": "Reads", "usage": "dynamoReadUnits", "quantity": 2 },
            { "label": "Writes", "usage": "dynamoWriteUnits", "quantity": 1 }
          ], "evidence": ["workers/thumbnail.ts:53", "fixtures/profile.json"] }
      ],
      "links": [
        { "from": "api", "to": "handler", "evidence": ["infra/profile.ts:39"] },
        { "from": "handler", "to": "original", "evidence": ["handlers/upload.ts:27"] },
        { "from": "original", "to": "processor", "evidence": ["infra/profile.ts:61 (ObjectCreated, originals/ prefix)"] },
        { "from": "processor", "to": "read-original", "evidence": ["workers/thumbnail.ts:23"] },
        { "from": "processor", "to": "thumbnail", "evidence": ["workers/thumbnail.ts:48"] },
        { "from": "processor", "to": "profile", "evidence": ["workers/thumbnail.ts:53"] }
      ]
    }
  }]
}
```

The example uses the same bucket for the original write, read, and thumbnail write.
The step links preserve each operation. Model retained storage when you can estimate
average retained bytes.

## Meter quantities

| Usage | Quantity |
| --- | --- |
| `requests` | Request, message, or event count on a supported resource such as API Gateway, AppSync, SQS or EventBridge |
| `lambdaInvocations` | Invocation count for one Lambda |
| `lambdaMs` | Total billed milliseconds for one Lambda, including all its invocations in the step |
| `dynamoReadUnits`, `dynamoWriteUnits` | Total read/write units, with size, consistency, indexes and transactions reflected in the quantity where applicable. InfraLens prices on-demand requests and shows provisioned usage against separate monthly capacity |
| `s3Get`, `s3Put` | GET/HEAD or PUT/POST/COPY/LIST counts, including Range or multipart calls |
| `s3UploadBytes` | Payload bytes uploaded. This documents volume. Storage and network usage have separate meters |
| `s3InternetBytes` | Bytes delivered directly from S3 to the public internet. Use the actual serving path. For CDN, inter-region or other unsupported transfer routes use `unpriced` and describe the route |
| `s3RetrievalBytes` | Bytes read from S3 when the storage class charges for retrieval |
| `s3StoredBytes`, `dynamoStoredBytes` | Average retained bytes in `sharedMonthly`, including attributable indexes, versions or derivatives when relevant |
| `unpriced` | Workload quantity with no automatic pricing. Explain the meaning in `label` and use factors to specify a unit |

For S3 requests, retrieval and storage, optional `storageClass` identifies the class used by application
code or lifecycle rules. Supported values are `STANDARD` (default) and `STANDARD_IA`. Write a
specific unsupported class if it is known, or `unknown` if it matters and cannot be resolved.
For Standard-IA storage, estimate the retained bytes after applicable minimum size and retention
adjustments when those affect the result. InfraLens selects the AWS rates for these usage kinds.

## State, identity and evidence

- Use unique workflow IDs and step IDs within each state. Links point to different steps in that state. Use either a graph `id` or exact `name` and `type` with optional `stack`. Omitting a resource denotes an external step. Shared monthly entries require a resource.
- Use `after` for current-state estimates. For comparisons use `baseline`, `target`, `before` and `after`. An explicit null state means absent. An omitted state means unknown. Keep a stable workflow ID across states.
- Each meter quantity is per workflow run or monthly for shared usage. It can be a nonnegative number, null if unknown, or up to 12 factors multiplied together, each with a `label`, `value`, and optional `unit`. Individual numeric inputs are capped at 10^12. For larger volumes use factors such as object count × bytes per object.
- Use `sharedMonthly` with `before` and/or `after` arrays of steps for inventory such as average retained storage. Keep `runsPerUser` at the workflow-state level. Leave `activeUsers` out so the report starts with the 1K scenario. The report multiplies each workflow frequency by the selected active user count.
- Use `evidence` on steps, meters and links. Use `frequencyEvidence` for the monthly frequency basis. Use state `issues` for material unknowns and `findings` for code-backed observations. A missing quantity or unavailable dimension should remain visible. Only write zero when verified.
