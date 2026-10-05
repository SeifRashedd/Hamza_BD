// Adds a few demo envelopes so you can try the site locally.
//   npm run seed            → only seeds an empty database
//   npm run seed -- --force → adds the demo envelopes anyway
import { config } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';

const DEMO_MESSAGES = [
  {
    senderName: 'Ahmed',
    hint: 'Our first university project',
    password: 'SmartFit',
    message:
      'Happy Birthday Hamza ❤️\n\nI hope this year brings you everything you wish for — and a lot fewer late-night deadlines than SmartFit did.\n\nProud to call you my friend. Let’s make this year legendary!',
    imageUrls: ['https://picsum.photos/seed/hamza-friends/900/600'],
  },
  {
    senderName: 'Sara',
    hint: 'The year we first met 👀',
    password: '2002',
    message:
      'Hamza!! 🎉\n\nAnother year of you being the funniest person in every room. Thank you for always showing up for the people you love.\n\nEat too much cake today. That’s an order.',
    imageUrls: [],
  },
  {
    senderName: 'Omar',
    hint: 'The game we never finish (one word, lowercase)',
    password: 'monopoly',
    message:
      'Happy birthday bro 🎂\n\nWishing you health, happiness and finally winning one game against me.\n\nLove you man.',
    imageUrls: [
      'https://picsum.photos/seed/hamza-cake/800/800',
      'https://picsum.photos/seed/hamza-trip/900/600',
    ],
  },
];

const db = openDatabase(config.databasePath);
const force = process.argv.includes('--force');

if (db.count() > 0 && !force) {
  console.log(`The database already has ${db.count()} envelope(s). Use "npm run seed -- --force" to add the demo ones anyway.`);
} else {
  for (const demo of DEMO_MESSAGES) {
    db.create({ ...demo, passwordHash: await hashPassword(demo.password) });
    console.log(`💌 Added envelope from ${demo.senderName} (password: ${demo.password})`);
  }
}

db.close();
