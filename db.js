// db.js
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI); // from .env
let db;

async function connectToDB() {
  try {
    await client.connect();
    db = client.db(process.env.MONGO_DB_NAME); // from .env
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    throw err;
  }
}

function getDB() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

module.exports = { connectToDB, getDB };
