require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_KEY);
const express = require('express');
const path = require('path');
const app = express();
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const YOUR_DOMAIN = 'http://localhost:4242';
const CURRENCY_SYMBOLS = {
  'USD': '$', // US Dollar
  'EUR': '€', // Euro
  'CRC': '₡', // Costa Rican Colón
  'GBP': '£', // British Pound Sterling
  'ILS': '₪', // Israeli New Sheqel
  'INR': '₹', // Indian Rupee
  'JPY': '¥', // Japanese Yen
  'KRW': '₩', // South Korean Won
  'NGN': '₦', // Nigerian Naira
  'PHP': '₱', // Philippine Peso
  'PLN': 'zł', // Polish Zloty
  'PYG': '₲', // Paraguayan Guarani
  'THB': '฿', // Thai Baht
  'UAH': '₴', // Ukrainian Hryvnia
  'VND': '₫', // Vietnamese Dong
};

app.get('/test', async (req, res) => {
  res.json({ it: 'works'})
})

app.get('/', async (req, res) => {
  try{
    const products = await stripe.products.list({
      limit: 3,
    });

    const prices = await stripe.prices.list({
      limit: 3,
    });

    prices.data.forEach((p) => {
      p.product = products.data.filter(prod => prod.id === p.product)[0];
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
    // res.json({
    //   prices: prices.data || [],
    //   CURRENCY_SYMBOLS: CURRENCY_SYMBOLS
    // })
    res.render('checkout', {
      prices: prices.data || [],
      CURRENCY_SYMBOLS: CURRENCY_SYMBOLS
    });
  } catch(e){
    res.json({
      e: e
    })
  }
})

app.get('/success', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.render('success');
})

app.get('/cancel', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.render('cancel');
})

app.post('/create-checkout-session/:price_id', async (req, res) => {
  if (!req.params.price_id){
    res.redirect(303, '/');
    return;
  }

  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price: req.params.price_id,
      quantity: 1,
    }, ],
    mode: 'subscription',
    success_url: `${YOUR_DOMAIN}/success`,
    cancel_url: `${YOUR_DOMAIN}/cancel`,
  });

  res.redirect(303, session.url);
});

app.listen(process.env.PORT || 8080, () => console.log('Running on port 8080'));