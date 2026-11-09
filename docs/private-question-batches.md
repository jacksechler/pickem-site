# Private question batches

New weeks are created as **private drafts**. Creating a week or adding the first question does not make anything available to players. Members cannot see the new week or its tiebreaker, and cannot submit picks, until the commissioner explicitly releases the complete card.

## Commissioner workflow

1. Open **Commissioner** and create the next week with a future lock deadline.
2. Add questions individually as usual, or use **Bulk add questions** to paste multiple rows or upload a CSV/TSV file.
3. For bulk paste, use `Sport | Question | Choice 1 | Choice 2` (additional choices are allowed). For CSV, use `sport,question,choice1,choice2` headers.
4. Click **Preview batch**, correct any errors, and then **Add questions to private draft**. The whole batch is inserted in one database request.
5. When the full card is ready, click **Release all N questions to players** and confirm. The release is atomic: all questions become available together.
6. After release, new questions cannot be inserted into that newly created week. Existing questions can still be edited through the commissioner tools subject to existing safeguards. Picks lock at the week-specific deadline or when all required members submit.

**Important:** Weeks that were already created before the feature was installed are grandfathered. The active Week 12 already had player picks and submissions, so its visibility and existing picks were preserved; the strict staging workflow starts with the next newly created week.

## Security

The database enforces visibility with RLS on `weeks` and `questions`, not merely a hidden browser element. `private.week_is_open` also blocks pick/submission writes until release. The release RPC is available only to the commissioner, validates all questions and the future lock deadline, and is irreversible. Existing weeks are grandfathered to avoid disrupting in-progress picks.

Tests: `tests/question_batch_model.test.cjs` and `tests/question_release_db.test.mjs`.
