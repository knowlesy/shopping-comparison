const sampleTitles = [
  "Tesco Lean Beef Steak Mince 5% Fat 750g",
  "Sainsbury's British Lean Beef Steak Mince 5% Fat 750g",
  "Morrisons British Lean Beef Mince 5% Fat 750g",
  "Iceland Lean Beef Steak Mince 5% Fat 1kg",
  "ASDA 5% Fat Beef Steak Mince 1kg",
  "ASDA Succulent Cod Fillets 400g",
  "ASDA 12 Free Range Medium Eggs",
  "ASDA Fat Free Greek Yogurt 1kg",
  "ASDA Green Lentils in Water 390g",
  "ASDA Semi Skimmed Milk 2 Pints",
  "ASDA Wholewheat Fusilli 1kg",
  "ASDA Baby New Potatoes 2kg",
  "ASDA Scottish Rolled Oats 1kg",
  "ASDA Wholemeal Medium Sliced Bread 800g",
  "Mutti Polpa Finely Chopped Tomatoes 400g",
  "ASDA Tomato Puree 200g",
  "ASDA Extra Virgin Olive Oil 500ml",
  "ASDA Crisp Courgettes 1kg",
  "ASDA Mixed Peppers 3 Pack",
  "ASDA Closed Cup Mushrooms 400g",
  "ASDA Sweet Baby Plum Tomatoes 300g",
  "ASDA British Carrots 1kg",
  "ASDA Crunchy Celery 1 Head",
  "ASDA Brown Onions 1kg",
  "ASDA Red Onions 1kg",
  "ASDA Garlic Bulbs 3 Pack",
  "ASDA Baby Spinach Leaves 240g",
  "ASDA Fairtrade Bananas Bunch",
  "ASDA Conference Pears 800g",
  "ASDA Sweet Clementines 600g",
  "ASDA Walnut Halves and Almonds 200g",
  "ASDA Chia Seeds 150g",
];

function extractSearchQuery(text: string): string {
  let clean = text
    .replace(/\(.*?\)/g, '')
    .replace(/\b(asda|tesco|sainsbury'?s?|morrisons?|iceland|just essentials|by sainsbury'?s?|british|scottish|succulent|crisp|sweet|crunchy|fresh|organic|authentic|medium|sliced|fine|double concentrate)\b/gi, '')
    .replace(/\b\d+\s*(?:kg|g|l|lt|ml|pk|pack|heads?|bunches?|tins?|pots?|bottles?|loaves|loaf|pints?)\b/gi, '')
    .replace(/\b\d+%\s*(?:fat|lean)?\b/gi, '')
    .replace(/['’]/g, '')
    .replace(/%/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 3) {
    clean = text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return clean;
}

console.log('Testing extracted search queries for all items:\n');
for (const title of sampleTitles) {
  console.log(`Original: "${title}"`);
  console.log(`Query:    "${extractSearchQuery(title)}"\n`);
}
