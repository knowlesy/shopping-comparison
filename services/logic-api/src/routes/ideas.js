import express from 'express';

export const ideasRouter = express.Router();

let ingredientIdeas = [
  {
    id: 'idea-1',
    name: '5% Lean Beef Steak Mince',
    category: 'protein',
    defaultFormat: '750g 5% lean beef mince',
    icon: '🥩',
    isPopular: true
  },
  {
    id: 'idea-2',
    name: 'Frozen Cod Loins',
    category: 'protein',
    defaultFormat: '1.6kg frozen cod loins',
    icon: '🐟',
    isPopular: true
  },
  {
    id: 'idea-3',
    name: 'Free Range Eggs',
    category: 'dairy',
    defaultFormat: '15 free range eggs',
    icon: '🥚',
    isPopular: true
  },
  {
    id: 'idea-4',
    name: '0% Authentic Greek Yogurt',
    category: 'dairy',
    defaultFormat: '1kg authentic Greek yogurt 0% fat',
    icon: '🥛',
    isPopular: true
  },
  {
    id: 'idea-5',
    name: 'Wholewheat Fusilli',
    category: 'pantry',
    defaultFormat: '1kg wholewheat fusilli',
    icon: '🌾',
    isPopular: true
  },
  {
    id: 'idea-6',
    name: 'Mutti Polpa Finely Chopped Tomatoes',
    category: 'pantry',
    defaultFormat: '3 x 400g Mutti Polpa chopped tomatoes',
    icon: '🥫',
    isPopular: true
  },
  {
    id: 'idea-7',
    name: 'Extra Virgin Olive Oil',
    category: 'pantry',
    defaultFormat: '500ml extra virgin olive oil',
    icon: '🫒',
    isPopular: true
  },
  {
    id: 'idea-8',
    name: 'Baby New Potatoes',
    category: 'produce',
    defaultFormat: '2kg baby new potatoes',
    icon: '🥔',
    isPopular: true
  },
  {
    id: 'idea-9',
    name: 'Semi-Skimmed Milk',
    category: 'dairy',
    defaultFormat: '2 Pints semi-skimmed milk',
    icon: '🥛',
    isPopular: true
  },
  {
    id: 'idea-10',
    name: 'Tinned Brown Lentils',
    category: 'pantry',
    defaultFormat: '2 x 400g tinned brown lentils',
    icon: '🍲',
    isPopular: true
  }
];

ideasRouter.get('/', (req, res) => {
  res.json(ingredientIdeas);
});

ideasRouter.post('/', (req, res) => {
  const newIdea = {
    ...req.body,
    id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  };
  ingredientIdeas.push(newIdea);
  res.json(newIdea);
});

ideasRouter.delete('/:id', (req, res) => {
  ingredientIdeas = ingredientIdeas.filter((i) => i.id !== req.params.id);
  res.json({ success: true });
});
