# meal-planning-worker

A Cloudflare Worker that serves the JSON API for a meal planning app, backed by a Cloudflare D1 (SQLite) database.

## Features

- Meals: list, get by id, and create
- Meal plans: list, create, and update per-day breakfast/lunch/dinner assignments
- Shopping list: list and add items
- Ingredients: list
- Simple shared list: read and save a single shared list (without the `/api` prefix, see notes)
- CORS enabled for all origins, including preflight `OPTIONS` requests
- Rate-limited diagnostics endpoint at `/api/debug` (one request per client IP every 5 seconds)

## API

Most routes work with or without the `/api` prefix (for example `/api/meals` and `/meals`). Responses are JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/meals` | List up to 50 meals |
| GET | `/api/meals/:id` | Get one meal |
| POST | `/api/meals` | Create a meal |
| GET | `/api/mealplans` | List meal plans |
| POST | `/api/mealplans` | Create a meal plan |
| PUT | `/api/mealplans/:id` | Update a meal plan |
| GET | `/api/shopping-list` | List shopping list items |
| POST | `/api/shopping-list` | Add a shopping list item |
| GET | `/api/ingredients` | List ingredients |
| GET | `/simple-shared-list` | Get the simple shared list |
| POST | `/simple-shared-list/save_list` | Save the simple shared list |
| GET | `/api/debug` | Diagnostics and rate-limit check |

## Project layout

- `worker.js`: request router and all handlers
- `wrangler.toml`: Worker config and the D1 binding (`DB`)
- `schema.sql`: D1 table definitions for `meals`, `shopping_list_items`, and `shared_lists`
- `package.json`: npm scripts and the Wrangler dependency

## Run it

Requires Node.js and an authenticated Wrangler (`npx wrangler login`).

```bash
npm install
npm run dev        # local dev server via wrangler dev
```

## Deploy

1. Create the D1 database and copy the printed `database_id` into `wrangler.toml`. The committed ID belongs to the original deployment and will not work on another account:

   ```bash
   npm run create-db
   ```

2. Apply the schema:

   ```bash
   npm run apply-schema
   ```

3. Deploy the Worker:

   ```bash
   npm run deploy
   ```

## Known gaps

- `schema.sql` does not define `meal_plans`, `ingredients`, or `simple_shared_lists`. `meal_plans` is created lazily by its handlers. `simple_shared_lists` is never created, so the simple shared list endpoints fail on a fresh database. `ingredients` is only read, so it must already exist.
- `/api/simple-shared-list` always returns 405. Its handler does not strip the `/api` prefix, so use `/simple-shared-list`.
- `GET /shared-lists/by_share_id` is not reachable. The handler expects a trailing slash, which the router removes before dispatch. The handler also queries a `share_id` column that `schema.sql` does not define.
- The lazily created `meals` table uses `rating INTEGER`, while `schema.sql` uses `rating TEXT`.
