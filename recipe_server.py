#!/usr/bin/env python3
"""
Lake Salt Bartending - Daily Drink Recipe Server
Serves drink recipes via a simple HTTP API and updates them daily.
"""

import json
import os
import random
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
RECIPES_FILE = Path(__file__).parent / 'recipes.json'
CURRENT_RECIPE_FILE = Path(__file__).parent / 'public' / 'current_recipe.json'
CURRENT_RECIPE_FILE.parent.mkdir(parents=True, exist_ok=True)

# Default recipes database
DEFAULT_RECIPES = [
    {
        "id": 1,
        "name": "Signature Mojito",
        "description": "A refreshing classic with fresh mint, lime, and a smooth rum base.",
        "ingredients": [
            "2 oz light rum",
            "1 oz fresh lime juice",
            "8-10 fresh mint leaves",
            "0.75 oz simple syrup",
            "3 oz club soda",
            "Ice and mint sprig for garnish"
        ],
        "instructions": "Muddle mint leaves with simple syrup in a glass. Add rum and lime juice. Fill with ice and top with club soda. Stir gently and garnish with a sprig of fresh mint.",
        "imageUrl": "🍹"
    },
    {
        "id": 2,
        "name": "Mountain Margarita",
        "description": "A Utah-inspired take on the classic with organic agave and local citrus.",
        "ingredients": [
            "2 oz premium tequila",
            "1 oz fresh lime juice",
            "0.75 oz organic agave nectar",
            "0.5 oz triple sec",
            "Salt rim",
            "Lime wheel for garnish"
        ],
        "instructions": "Rim a glass with salt. Shake tequila, lime juice, agave, and triple sec with ice. Strain into the rimmed glass with fresh ice. Garnish with a lime wheel.",
        "imageUrl": "🍸"
    },
    {
        "id": 3,
        "name": "Golden Hour",
        "description": "A warm, elegant cocktail perfect for corporate celebrations.",
        "ingredients": [
            "1.5 oz bourbon",
            "0.5 oz honey syrup",
            "0.5 oz fresh lemon juice",
            "2 dashes of Angostura bitters",
            "Warm water",
            "Cinnamon stick for garnish"
        ],
        "instructions": "Warm a glass with hot water, then empty. Combine bourbon, honey syrup, lemon juice, and bitters. Add a large ice cube. Top with a splash of warm water. Stir and garnish with a cinnamon stick.",
        "imageUrl": "✨"
    },
    {
        "id": 4,
        "name": "Berry Wedding Punch",
        "description": "Elegant and celebratory, perfect for weddings and special events.",
        "ingredients": [
            "2 oz vodka",
            "1 oz cranberry juice",
            "0.5 oz fresh raspberry juice",
            "0.5 oz elderflower liqueur",
            "1 oz sparkling wine",
            "Fresh raspberries for garnish"
        ],
        "instructions": "Combine vodka, cranberry juice, raspberry juice, and elderflower liqueur in a shaker with ice. Strain into a champagne flute. Top with sparkling wine. Garnish with fresh raspberries.",
        "imageUrl": "💜"
    },
    {
        "id": 5,
        "name": "Snow Cap Old Fashioned",
        "description": "A winter twist on the classic, with maple and cinnamon notes.",
        "ingredients": [
            "2 oz rye whiskey",
            "0.5 oz maple syrup",
            "2 dashes of Angostura bitters",
            "1 dash of cinnamon bitters",
            "Large ice cube",
            "Orange twist"
        ],
        "instructions": "Combine maple syrup, bitters, and a splash of water in a glass. Add a large ice cube. Pour in whiskey and stir. Express an orange twist over the drink and use as garnish.",
        "imageUrl": "🥃"
    },
    {
        "id": 6,
        "name": "Tiki Sunset",
        "description": "Tropical flavors perfect for summer celebrations and themed events.",
        "ingredients": [
            "1.5 oz light rum",
            "0.5 oz dark rum",
            "1 oz fresh pineapple juice",
            "0.75 oz fresh orange juice",
            "0.5 oz lime juice",
            "0.25 oz orgeat syrup",
            "Pineapple wedge and cherry for garnish"
        ],
        "instructions": "Shake both rums, pineapple juice, orange juice, lime juice, and orgeat with ice. Pour into a tiki glass filled with crushed ice. Garnish with a pineapple wedge and cherry.",
        "imageUrl": "🌴"
    },
    {
        "id": 7,
        "name": "Elderflower Fizz",
        "description": "Light and floral, perfect for daytime events and brunch celebrations.",
        "ingredients": [
            "1.5 oz gin",
            "0.75 oz elderflower liqueur",
            "0.5 oz fresh lemon juice",
            "0.25 oz simple syrup",
            "Top with sparkling water",
            "Elderflower for garnish"
        ],
        "instructions": "Shake gin, elderflower liqueur, lemon juice, and simple syrup with ice. Strain into a glass with fresh ice. Top with sparkling water and gently stir. Garnish with an elderflower bloom.",
        "imageUrl": "🌼"
    },
    {
        "id": 8,
        "name": "Spiced Apple Cider Cocktail",
        "description": "Warm and cozy, perfect for autumn events and holiday gatherings.",
        "ingredients": [
            "2 oz bourbon",
            "4 oz apple cider",
            "0.5 oz fresh lemon juice",
            "0.5 oz honey",
            "Cinnamon stick",
            "Apple slice for garnish"
        ],
        "instructions": "Warm the apple cider gently (do not boil). In a mug, combine bourbon, cider, lemon juice, and honey. Stir well. Garnish with a cinnamon stick and apple slice.",
        "imageUrl": "🍎"
    },
]

def load_recipes():
    """Load recipes from JSON file or create default."""
    if RECIPES_FILE.exists():
        try:
            with open(RECIPES_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading recipes: {e}")
            return DEFAULT_RECIPES
    return DEFAULT_RECIPES

def save_recipes(recipes):
    """Save recipes to JSON file."""
    try:
        with open(RECIPES_FILE, 'w') as f:
            json.dump(recipes, f, indent=2)
    except Exception as e:
        print(f"Error saving recipes: {e}")

def select_daily_recipe():
    """Select today's recipe based on the date."""
    recipes = load_recipes()
    if not recipes:
        recipes = DEFAULT_RECIPES
        save_recipes(recipes)
    
    # Use date as seed for consistent daily selection
    today = datetime.now().date()
    day_number = int(today.strftime("%s")) // 86400  # Days since epoch
    random.seed(day_number)
    
    selected = random.choice(recipes)
    random.seed()  # Reset seed
    
    return selected

def update_daily_recipe():
    """Update the daily recipe file."""
    recipe = select_daily_recipe()
    try:
        with open(CURRENT_RECIPE_FILE, 'w') as f:
            json.dump(recipe, f, indent=2)
        print(f"[{datetime.now()}] Updated daily recipe: {recipe['name']}")
    except Exception as e:
        print(f"Error updating daily recipe: {e}")

@app.route('/api/recipe-of-day', methods=['GET'])
def get_recipe_of_day():
    """API endpoint to get today's drink recipe."""
    try:
        if CURRENT_RECIPE_FILE.exists():
            with open(CURRENT_RECIPE_FILE, 'r') as f:
                return jsonify(json.load(f))
        else:
            recipe = select_daily_recipe()
            update_daily_recipe()
            return jsonify(recipe)
    except Exception as e:
        print(f"Error in get_recipe_of_day: {e}")
        return jsonify(select_daily_recipe())

@app.route('/api/recipes', methods=['GET'])
def get_all_recipes():
    """API endpoint to get all available recipes."""
    return jsonify(load_recipes())

@app.route('/api/recipes/<int:recipe_id>', methods=['GET'])
def get_recipe(recipe_id):
    """API endpoint to get a specific recipe by ID."""
    recipes = load_recipes()
    for recipe in recipes:
        if recipe.get('id') == recipe_id:
            return jsonify(recipe)
    return jsonify({"error": "Recipe not found"}), 404

@app.route('/api/recipes', methods=['POST'])
def add_recipe():
    """API endpoint to add a new recipe."""
    from flask import request
    data = request.json
    recipes = load_recipes()
    
    # Generate new ID
    new_id = max([r.get('id', 0) for r in recipes]) + 1 if recipes else 1
    data['id'] = new_id
    
    recipes.append(data)
    save_recipes(recipes)
    
    return jsonify(data), 201

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

def init_scheduler():
    """Initialize the background scheduler for daily recipe updates."""
    scheduler = BackgroundScheduler()
    # Schedule recipe update at midnight every day
    scheduler.add_job(
        update_daily_recipe,
        'cron',
        hour=0,
        minute=0,
        id='daily_recipe_update'
    )
    scheduler.start()
    print("Scheduler initialized: daily recipe updates at midnight UTC")
    return scheduler

if __name__ == '__main__':
    # Initialize recipes
    recipes = load_recipes()
    if not RECIPES_FILE.exists():
        save_recipes(DEFAULT_RECIPES)
        print(f"Created default recipes file: {RECIPES_FILE}")
    
    # Initialize daily recipe
    if not CURRENT_RECIPE_FILE.exists():
        update_daily_recipe()
    
    # Start scheduler
    scheduler = init_scheduler()
    
    # Run Flask app
    print("🍸 Lake Salt Bartending - Recipe Server")
    print(f"📁 Recipes file: {RECIPES_FILE}")
    print(f"📁 Current recipe file: {CURRENT_RECIPE_FILE}")
    print("🚀 Starting server on http://localhost:5000")
    print("📝 API Endpoints:")
    print("  - GET /api/recipe-of-day     (today's recipe)")
    print("  - GET /api/recipes           (all recipes)")
    print("  - GET /api/recipes/<id>      (specific recipe)")
    print("  - POST /api/recipes          (add new recipe)")
    print("  - GET /health                (health check)")
    print("\nPress Ctrl+C to stop the server\n")
    
    app.run(debug=True, port=5000, use_reloader=False)

