-- Meal Planning App DB Schema for Cloudflare D1

-- Meals table
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  spoonacular_id INTEGER,
  ingredients TEXT, -- JSON string of ingredients
  is_custom BOOLEAN DEFAULT 0,
  rating TEXT -- Can be heart, skull, or x
);

-- Shopping list items
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  purchased BOOLEAN DEFAULT 0,
  day TEXT, -- Day of the week (Monday, Tuesday, etc.)
  meal_type TEXT, -- Type of meal (Breakfast, Lunch, Dinner)
  ingredient_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shared shopping lists
CREATE TABLE IF NOT EXISTS shared_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  items TEXT, -- JSON string of items
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 