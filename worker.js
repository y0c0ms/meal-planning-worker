// Cloudflare Worker script for meal planning app API (ES module format)

export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  // Set up CORS headers - these should be included in EVERY response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400', // 24 hours
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

  // Add debug endpoint to check API status
  if (path === '/api/debug' || path === '/debug') {
    return new Response(JSON.stringify({
      status: 'online',
      timestamp: new Date().toISOString(),
      worker_version: '1.1', // Increment version to track deployment
      endpoints: ['/meals', '/mealplans', '/shopping-list', '/ingredients'],
      diagnostics: {
        cors_enabled: true,
        preflight_supported: true,
        origin: request.headers.get('Origin') || 'Not specified'
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Normalize the path for consistency
  let normalizedPath = path;
  
  // Remove trailing slash except for root path
  if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  
  // Function to wrap all responses and ensure CORS headers are applied
  const wrapResponseWithCors = (responsePromise) => {
    return Promise.resolve(responsePromise)
      .then(response => {
        // Create a new response with the same body but with CORS headers added
        const newHeaders = new Headers(response.headers);
        
        // Add all CORS headers
        Object.keys(corsHeaders).forEach(key => {
          newHeaders.set(key, corsHeaders[key]);
        });
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      })
      .catch(error => {
        // Even error responses need CORS headers
        return new Response(JSON.stringify({ 
          error: error.message,
          stack: error.stack 
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      });
  };
  
  // API routes
  if (path.startsWith('/api/') || normalizedPath.match(/^\/(meals|mealplans|shopping-list|ingredients|shared-lists)/)) {
    // Add CORS headers to all API responses
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json'
    };

    try {
      // Handle different API endpoints
      // For path matching, use both original and normalized path to support clients that might use either
      let responsePromise;
      
      if (normalizedPath.startsWith('/api/meals') || normalizedPath.startsWith('/meals')) {
        responsePromise = handleMeals(request, env, headers, normalizedPath);
      } else if (normalizedPath.startsWith('/api/shopping-list') || normalizedPath.startsWith('/shopping-list')) {
        responsePromise = handleShoppingList(request, env, headers, normalizedPath);
      } else if (normalizedPath.startsWith('/api/mealplans') || normalizedPath.startsWith('/mealplans')) {
        responsePromise = handleMealPlans(request, env, headers, normalizedPath);
      } else if (normalizedPath.startsWith('/api/shared-lists') || normalizedPath.startsWith('/shared-lists')) {
        responsePromise = handleSharedLists(request, env, headers, normalizedPath);
      } else if (normalizedPath.startsWith('/api/ingredients') || normalizedPath.startsWith('/ingredients')) {
        responsePromise = handleIngredients(request, env, headers, normalizedPath);
      } else if (normalizedPath.startsWith('/api/simple-shared-list') || normalizedPath.startsWith('/simple-shared-list')) {
        responsePromise = handleSimpleSharedList(request, env, headers, normalizedPath);
      } else {
        responsePromise = new Response(JSON.stringify({ 
          error: 'API endpoint not found',
          requested_path: path,
          normalized_path: normalizedPath,
          supported_endpoints: ['/meals', '/mealplans', '/shopping-list', '/ingredients', '/shared-lists', '/simple-shared-list']
        }), {
          status: 404,
          headers
        });
      }
      
      // Wrap the response to ensure CORS headers are applied
      return wrapResponseWithCors(responsePromise);
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        requested_path: path 
      }), {
        status: 500,
        headers
      });
    }
  }

  // If not an API route, return a 404 with CORS headers
  return new Response(JSON.stringify({
    error: 'Not found',
    path: path,
    note: 'The API endpoints should be prefixed with /api or use one of the direct endpoint paths'
  }), { 
    status: 404,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// Handle meal-related requests
async function handleMeals(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET meals list
  if ((normalizedPath === '/meals' || normalizedPath === '/meals/') && request.method === 'GET') {
    // Example query to D1 database
    const { results } = await env.DB.prepare(
      `SELECT * FROM meals LIMIT 50`
    ).all();
    
    return new Response(JSON.stringify({data: results}), { headers });
  }
  
  // GET single meal
  if (normalizedPath.match(/^\/meals\/\d+$/) && request.method === 'GET') {
    const id = normalizedPath.split('/')[2];
    const stmt = env.DB.prepare(`SELECT * FROM meals WHERE id = ?`);
    const meal = await stmt.bind(id).first();
    
    if (!meal) {
      return new Response(JSON.stringify({ error: 'Meal not found', meal_id: id }), {
        status: 404,
        headers
      });
    }
    
    return new Response(JSON.stringify(meal), { headers });
  }
  
  // POST new meal
  if ((normalizedPath === '/meals' || normalizedPath === '/meals/') && request.method === 'POST') {
    const data = await request.json();
    
    // Insert new meal
    const { success, meta } = await env.DB.prepare(
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
      return new Response(JSON.stringify({ 
        message: 'Meal created successfully',
        data: { id: meta.last_row_id, ...data }
      }), {
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
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET', 'POST'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET, POST'
    }
  });
}

// Handle shopping list requests
async function handleShoppingList(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET shopping list items
  if ((normalizedPath === '/shopping-list' || normalizedPath === '/shopping-list/') && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM shopping_list_items ORDER BY day, meal_type`
    ).all();
    
    return new Response(JSON.stringify({data: results}), { headers });
  }
  
  // POST new shopping list item
  if ((normalizedPath === '/shopping-list' || normalizedPath === '/shopping-list/') && request.method === 'POST') {
    const data = await request.json();
    
    const { success, meta } = await env.DB.prepare(
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
      return new Response(JSON.stringify({ 
        message: 'Item added successfully',
        data: { id: meta.last_row_id, ...data }
      }), {
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
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET', 'POST'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET, POST'
    }
  });
}

// Handle meal plan requests
async function handleMealPlans(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET meal plans
  if ((normalizedPath === '/mealplans' || normalizedPath === '/mealplans/') && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM meal_plans`
    ).all();
    
    return new Response(JSON.stringify({ data: results }), { headers });
  }
  
  // POST new meal plan
  if ((normalizedPath === '/mealplans' || normalizedPath === '/mealplans/') && request.method === 'POST') {
    const data = await request.json();
    
    const { success, meta } = await env.DB.prepare(
      `INSERT INTO meal_plans (day, breakfast, lunch, dinner) 
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      data.day,
      data.breakfast || null,
      data.lunch || null,
      data.dinner || null
    )
    .run();
    
    if (success) {
      return new Response(JSON.stringify({ 
        message: 'Meal plan created successfully',
        data: { id: meta.last_row_id, ...data }
      }), {
        status: 201,
        headers
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to create meal plan' }), {
        status: 500,
        headers
      });
    }
  }

  // PUT/UPDATE meal plan
  if (normalizedPath.match(/^\/mealplans\/\d+\/$/) && request.method === 'PUT') {
    const id = normalizedPath.split('/')[2];
    const data = await request.json();
    
    const { success } = await env.DB.prepare(
      `UPDATE meal_plans SET 
       breakfast = ?, lunch = ?, dinner = ?
       WHERE id = ?`
    )
    .bind(
      data.breakfast || null,
      data.lunch || null,
      data.dinner || null,
      id
    )
    .run();
    
    if (success) {
      return new Response(JSON.stringify({ 
        message: 'Meal plan updated successfully',
        data: { id: parseInt(id), ...data }
      }), { headers });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to update meal plan' }), {
        status: 500,
        headers
      });
    }
  }
  
  // Default response for unhandled meal plan requests
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET', 'POST', 'PUT'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET, POST, PUT'
    }
  });
}

// Handle shared lists requests
async function handleSharedLists(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET shared list by share_id
  if (normalizedPath === '/shared-lists/by_share_id/' && request.method === 'GET') {
    const shareId = url.searchParams.get('id');
    
    if (!shareId) {
      return new Response(JSON.stringify({ error: 'Share ID is required' }), {
        status: 400,
        headers
      });
    }
    
    const { results } = await env.DB.prepare(
      `SELECT * FROM shared_lists WHERE share_id = ? LIMIT 1`
    ).bind(shareId).all();
    
    if (results && results.length > 0) {
      return new Response(JSON.stringify(results[0]), { headers });
    } else {
      return new Response(JSON.stringify({ error: 'Shared list not found' }), {
        status: 404,
        headers
      });
    }
  }
  
  // Default response for unhandled shared list requests
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET'
    }
  });
}

// Handle ingredients requests
async function handleIngredients(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET ingredients
  if ((normalizedPath === '/ingredients' || normalizedPath === '/ingredients/') && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM ingredients ORDER BY name`
    ).all();
    
    return new Response(JSON.stringify({ data: results }), { headers });
  }
  
  // Default response for unhandled ingredients requests
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET'
    }
  });
}

// Handle simple shared list requests
async function handleSimpleSharedList(request, env, headers, path) {
  const url = new URL(request.url);
  
  // Remove /api prefix if present for consistent handling
  const normalizedPath = path.replace(/^\/api/, '');
  
  // GET simple shared list
  if ((normalizedPath === '/simple-shared-list' || normalizedPath === '/simple-shared-list/') && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM simple_shared_lists LIMIT 1`
    ).all();
    
    if (results && results.length > 0) {
      const now = new Date();
      const formattedDate = now.toISOString();
      
      results[0].last_checked = formattedDate;
      results[0].last_updated_formatted = new Date(results[0].last_updated).toLocaleString();
      
      return new Response(JSON.stringify(results[0]), { headers });
    } else {
      // Create a new simple shared list if none exists
      const initialList = {
        items_json: '[]',
        last_updated: new Date().toISOString()
      };
      
      const { success, meta } = await env.DB.prepare(
        `INSERT INTO simple_shared_lists (items_json, last_updated) VALUES (?, ?)`
      ).bind(initialList.items_json, initialList.last_updated).run();
      
      if (success) {
        initialList.id = meta.last_row_id;
        initialList.last_updated_formatted = new Date(initialList.last_updated).toLocaleString();
        return new Response(JSON.stringify(initialList), { headers });
      } else {
        return new Response(JSON.stringify({ error: 'Failed to create simple shared list' }), {
          status: 500,
          headers
        });
      }
    }
  }
  
  // Save simple shared list
  if ((normalizedPath === '/simple-shared-list' || normalizedPath === '/simple-shared-list/save_list') && request.method === 'POST') {
    const data = await request.json();
    const now = new Date().toISOString();
    
    // Check if list exists
    const { results } = await env.DB.prepare(
      `SELECT id FROM simple_shared_lists LIMIT 1`
    ).all();
    
    let success, meta;
    
    if (results && results.length > 0) {
      // Update existing list
      const result = await env.DB.prepare(
        `UPDATE simple_shared_lists SET items_json = ?, last_updated = ? WHERE id = ?`
      ).bind(data.items_json, now, results[0].id).run();
      
      success = result.success;
      meta = { last_row_id: results[0].id };
    } else {
      // Create new list
      const result = await env.DB.prepare(
        `INSERT INTO simple_shared_lists (items_json, last_updated) VALUES (?, ?)`
      ).bind(data.items_json, now).run();
      
      success = result.success;
      meta = result.meta;
    }
    
    if (success) {
      const response = {
        id: meta.last_row_id,
        items_json: data.items_json,
        last_updated: now,
        last_updated_formatted: new Date(now).toLocaleString()
      };
      
      return new Response(JSON.stringify(response), { headers });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to save shared list' }), {
        status: 500,
        headers
      });
    }
  }
  
  // Default response for unhandled simple shared list requests
  return new Response(JSON.stringify({ 
    error: 'Method not allowed',
    path: path,
    normalized_path: normalizedPath,
    method: request.method,
    allowed_methods: ['GET', 'POST'],
  }), {
    status: 405,
    headers: {
      ...headers,
      'Allow': 'GET, POST'
    }
  });
} 
