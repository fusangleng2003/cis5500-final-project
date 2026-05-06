# Normalization Proof — 3NF / BCNF

The schema in [`sql/schema.sql`](../sql/schema.sql) has two business tables.
Below is a rigorous walk-through showing each is in **3NF**, and that the only
multi-attribute table (`Game`) is also in **BCNF**.

## Definitions used

A relation `R` is in:

- **1NF** if every attribute is atomic.
- **2NF** if 1NF holds and no non-prime attribute is partially dependent on
  any candidate key.
- **3NF** if 2NF holds and every non-trivial FD `X → A` either has `X` as a
  superkey, or `A` is a prime attribute.
- **BCNF** if every non-trivial FD `X → A` has `X` as a superkey.

A single-attribute primary key trivially satisfies 2NF (no proper subset of
the key exists), so the analysis below focuses on which FDs hold and whether
the LHS is a superkey.

---

## Table `Game`

**Attributes**: `game_id, name, description, year_published, min_players,
max_players, min_playtime, max_playtime, min_age, image_url, thumbnail,
avg_rating, geek_rating, num_voters, rank, complexity`.

**Candidate keys**: `{game_id}` only. (Per BGG, `game_id` is a stable
identifier; nothing else in the dataset is guaranteed unique — `name` can
collide for re-implementations and `rank` only exists for ranked games.)

**Functional dependencies**: every non-key attribute is a fact _about_ that
specific game and is determined exclusively by `game_id`. Concretely:

```
{game_id} → name
{game_id} → description
{game_id} → year_published
{game_id} → min_players
{game_id} → max_players
{game_id} → min_playtime
{game_id} → max_playtime
{game_id} → min_age
{game_id} → image_url
{game_id} → thumbnail
{game_id} → avg_rating
{game_id} → geek_rating
{game_id} → num_voters
{game_id} → rank
{game_id} → complexity
```

There are no other non-trivial FDs:

- `name` does not determine anything else — multiple BGG games share the
  same title (re-implementations, expansions sharing the name).
- `(year_published, name)` is not unique either — confirmed in the data.
- Numeric BGG metadata (`avg_rating`, `geek_rating`, …) are not deterministic
  functions of each other; e.g. two different games can share the same
  `avg_rating`.

**1NF.** All attributes are atomic: integers, floats, and TEXT (we do not
store comma-separated lists or JSON arrays in `Game`).

**2NF.** The only candidate key is `{game_id}` — a single attribute — so no
non-prime attribute can be partially dependent on a proper subset of the key.

**3NF.** For every FD `{game_id} → A`, the LHS `{game_id}` is the candidate
key (and therefore a superkey). 3NF satisfied trivially.

**BCNF.** Same argument as 3NF: every non-trivial FD has `{game_id}` on the
left-hand side, which is a superkey. `Game` is in **BCNF**.

---

## Table `Review`

**Attributes**: `review_id, game_id, user_id, comment, comment_timestamp,
rating, rating_timestamp, post_date`.

**Candidate keys**: `{review_id}` only. We deliberately do _not_ use
`(game_id, user_id)` as a key — the source CSV contains repeat reviews from
the same user across time (e.g. an updated rating years later).

**Functional dependencies**:

```
{review_id} → game_id
{review_id} → user_id
{review_id} → comment
{review_id} → comment_timestamp
{review_id} → rating
{review_id} → rating_timestamp
{review_id} → post_date
```

There is one further FD worth analyzing:

```
{game_id} → ???   -- ambiguous; one game has many reviews. No dependency.
{user_id} → ???   -- ambiguous; one user posts many reviews. No dependency.
```

So neither `game_id` nor `user_id` determines any other attribute.

**1NF.** All attributes atomic.

**2NF.** Single-attribute key, no partial dependency possible.

**3NF.** Every non-trivial FD has `{review_id}` (the candidate key) as the
LHS. 3NF satisfied. Furthermore there is no transitive dependency: no
non-prime attribute determines another non-prime attribute (e.g. `rating`
does not determine `post_date`, etc.).

**BCNF.** Every non-trivial FD's LHS is a superkey — same argument as 3NF.
`Review` is in BCNF.

---

## Why we did not split further

A few candidate refactors we considered and rejected, with reasoning:

1. **Promoting `user_id` to a `User(user_id PK)` table.** The Kaggle dataset
   gives us no other user-level data, so the resulting table would have a
   single column equal to its primary key — an anti-pattern. No FD violation
   exists in `Review` to fix.

2. **Promoting `year_published` aggregations to a per-year stats table.**
   Stats like "games released in 1995 above the year average" are computed
   in SQL (see Q7 in `sql/queries.sql`) — materializing them would couple
   the schema to a specific aggregation choice and create update anomalies
   if `Game` rows ever change.

3. **Splitting `Game` into "core attributes" + "BGG metrics".** Both groups
   are functionally dependent on the same key (`game_id`), so splitting
   them would not satisfy any 3NF concern; it would only force more joins
   on every detail-page request.

## Entity resolution and de-duplication

We dedupe on `game_id` in `load_game.sql` (the source CSV occasionally has
the same BGG ID listed under both the main and expansions feed). Since
`game_id` is the primary key, this is true entity resolution — different
rows describing the _same_ game are collapsed to one row before the
constraint is enforced. The kept row is the one with the lowest BGG `rank`
(highest-quality entry).

In `load_review.sql` we apply `DISTINCT ON (review_id)` and an inner join
against `Game(game_id)` so that:

- duplicate review IDs collapse to one (BGG occasionally re-emits a review
  on rating updates), and
- reviews referencing a `game_id` that did not survive the `Game` load are
  dropped, preserving referential integrity.
