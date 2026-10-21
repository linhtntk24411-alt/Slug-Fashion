const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3003;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const client = new MongoClient(mongoUri);

app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const database = client.db('FashionData');
const fashionCollection = database.collection('Fashion');
const countersCollection = database.collection('Counters');

function slugify(value) {
  return String(value || 'fashion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'fashion';
}

async function nextFashionId() {
  const counter = await countersCollection.findOneAndUpdate(
    { _id: 'fashion-idf' },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return counter.sequence;
}

function fashionSlug(fashion, idf) {
  const label = fashion.fashion_subject || fashion.style || fashion.fashion_detail;
  return `${slugify(label)}-${idf}`;
}

async function ensureFashionIdentifiers() {
  const fashions = await fashionCollection.find({}).sort({ idf: 1, _id: 1 }).toArray();
  const existingIds = fashions
    .map((fashion) => fashion.idf)
    .filter((idf) => Number.isSafeInteger(idf) && idf > 0);
  const maxId = existingIds.reduce((max, idf) => Math.max(max, idf), 0);

  await countersCollection.updateOne(
    { _id: 'fashion-idf' },
    { $max: { sequence: maxId } },
    { upsert: true },
  );

  const seenIds = new Set();
  const seenSlugs = new Set();
  for (const fashion of fashions) {
    let idf = fashion.idf;
    if (!Number.isSafeInteger(idf) || idf < 1 || seenIds.has(idf)) {
      idf = await nextFashionId();
    }
    seenIds.add(idf);

    let slug =
      typeof fashion.slug === 'string' && fashion.slug.trim()
        ? fashion.slug.trim()
        : fashionSlug(fashion, idf);
    if (seenSlugs.has(slug)) {
      slug = fashionSlug(fashion, idf);
    }
    let suffix = 1;
    const baseSlug = slug;
    while (seenSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    seenSlugs.add(slug);

    if (fashion.idf !== idf || fashion.slug !== slug) {
      await fashionCollection.updateOne(
        { _id: fashion._id },
        { $set: { idf, slug } },
      );
    }
  }

  await fashionCollection.createIndex({ idf: 1 }, { unique: true, name: 'unique_fashion_idf' });
  await fashionCollection.createIndex({ slug: 1 }, { unique: true, name: 'unique_fashion_slug' });
}

function tokenize(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
  return new Set(normalized.match(/[a-z0-9]+/g) || []);
}

function jaccardSimilarity(queryTokens, text) {
  const textTokens = tokenize(text);
  if (!queryTokens.size || !textTokens.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      intersection += 1;
    }
  }
  const union = queryTokens.size + textTokens.size - intersection;
  return union ? intersection / union : 0;
}

app.get('/', (_req, res) => {
  res.send('This Web server is processed for MongoDB');
});

app.get('/fashions/search', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const field = req.query.field || 'fashion_subject';
    const limit = req.query.limit === undefined ? 12 : Number(req.query.limit);

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    if (!['fashion_subject', 'fashion_detail'].includes(field)) {
      return res.status(400).json({ message: 'Invalid search field' });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Limit must be between 1 and 100' });
    }

    const queryTokens = tokenize(query);
    if (!queryTokens.size) {
      return res.status(400).json({ message: 'Search query must contain letters or numbers' });
    }

    const fashions = await fashionCollection.find({}).toArray();
    const results = fashions
      .map((fashion) => ({
        ...fashion,
        jaccard_similarity: jaccardSimilarity(queryTokens, fashion[field]),
      }))
      .filter((fashion) => fashion.jaccard_similarity > 0)
      .sort(
        (left, right) =>
          right.jaccard_similarity - left.jaccard_similarity || left.idf - right.idf,
      )
      .slice(0, limit);

    return res.json(results);
  } catch (error) {
    return next(error);
  }
});

app.get('/fashions/slug/:slug', async (req, res, next) => {
  try {
    const fashion = await fashionCollection.findOne({ slug: req.params.slug });
    if (!fashion) {
      return res.status(404).json({ message: 'Not found Fashion' });
    }
    return res.json(fashion);
  } catch (error) {
    return next(error);
  }
});

app.get('/fashions', async (_req, res, next) => {
  try {
    const fashions = await fashionCollection.find({}).sort({ idf: 1 }).toArray();
    return res.json(fashions);
  } catch (error) {
    return next(error);
  }
});

app.get('/fashions/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid Fashion Id' });
    }
    const fashion = await fashionCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!fashion) {
      return res.status(404).json({ message: 'Not found Fashion' });
    }
    return res.json(fashion);
  } catch (error) {
    return next(error);
  }
});

app.post('/fashions', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: 'Fashion must be a JSON object' });
    }

    const idf = await nextFashionId();
    const fashion = { ...req.body, idf, slug: fashionSlug(req.body, idf) };
    delete fashion._id;
    const result = await fashionCollection.insertOne(fashion);
    return res.status(201).json({ ...fashion, _id: result.insertedId });
  } catch (error) {
    return next(error);
  }
});

app.put('/fashions', async (req, res, next) => {
  try {
    const id = req.body && req.body._id;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Fashion Id' });
    }

    await fashionCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          style: req.body.style,
          fashion_subject: req.body.fashion_subject,
          fashion_detail: req.body.fashion_detail,
          fashion_image: req.body.fashion_image,
        },
      },
    );

    const fashion = await fashionCollection.findOne({ _id: new ObjectId(id) });
    if (!fashion) {
      return res.status(404).json({ message: 'Not found Fashion' });
    }
    return res.json(fashion);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('Fashion API error:', error);
  res.status(500).json({ message: 'Internal server error' });
});

async function startServer() {
  await client.connect();
  await ensureFashionIdentifiers();
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`My Server listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start Fashion API:', error);
  process.exitCode = 1;
});
