// Cloudflare Worker script for meal planning app API (ES module format)

export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  // Set up CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Get the URL and path
  const url = new URL(request.url);
  const path = url.pathname;

  // API routes
  if (path.startsWith('/api/')) {
    // Add CORS headers to all API responses
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json'
    };

    try {
      // Handle different API endpoints
      if (path.startsWith('/api/meals')) {
        return await handleMeals(request, env, headers);
      } else if (path.startsWith('/api/shopping-list')) {
        return await handleShoppingList(request, env, headers);
      } else {
        return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
          status: 404,
          headers
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers
      });
    }
  }

  // If not an API route, return a 404
  return new Response('Not found', { status: 404 });
}

// Handle meal-related requests
async function handleMeals(request, env, headers) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // GET meals list
  if (path === '/api/meals' && request.method === 'GET') {
    // Example query to D1 database
    const { results } = await env.DB.prepare(
      `SELECT * FROM meals LIMIT 50`
    ).all();
    
    return new Response(JSON.stringify(results), { headers });
  }
  
  // GET single meal
  if (path.match(/^\/api\/meals\/\d+$/) && request.method === 'GET') {
    const id = path.split('/').pop();
    const stmt = env.DB.prepare(`SELECT * FROM meals WHERE id = ?`);
    const meal = await stmt.bind(id).first();
    
    if (!meal) {
      return new Response(JSON.stringify({ error: 'Meal not found' }), {
        status: 404,
        headers
      });
    }
    
    return new Response(JSON.stringify(meal), { headers });
  }
  
  // POST new meal
  if (path === '/api/meals' && request.method === 'POST') {
    const data = await request.json();
    
    // Insert new meal
    const { success } = await env.DB.prepare(
      `INSERT INTO meals (name, description, ingredients, is_custom, rating) 
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      data.name,
      data.description || '',
      JSON.stringify(data.ingredients || []),
      data.is_custom || false,
      data.rating || null
    )
    .run();
    
    if (success) {
      return new Response(JSON.stringify({ message: 'Meal created successfully' }), {
        status: 201,
        headers
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to create meal' }), {
        status: 500,
        headers
      });
    }
  }
  
  // Default response for unhandled meal requests
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers
  });
}

// Handle shopping list requests
async function handleShoppingList(request, env, headers) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // GET shopping list items
  if (path === '/api/shopping-list' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM shopping_list_items ORDER BY day, meal_type`
    ).all();
    
    return new Response(JSON.stringify(results), { headers });
  }
  
  // POST new shopping list item
  if (path === '/api/shopping-list' && request.method === 'POST') {
    const data = await request.json();
    
    const { success } = await env.DB.prepare(
      `INSERT INTO shopping_list_items (name, quantity, unit, day, meal_type, purchased) 
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.name,
      data.quantity || '',
      data.unit || '',
      data.day || null,
      data.meal_type || null,
      data.purchased || false
    )
    .run();
    
    if (success) {
      return new Response(JSON.stringify({ message: 'Item added successfully' }), {
        status: 201,
        headers
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to add item' }), {
        status: 500,
        headers
      });
    }
  }
  
  // Default response for unhandled shopping list requests
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers
  });
}