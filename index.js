require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_KEY);
const express = require('express');
const path = require('path');
const app = express();
const axios = require('axios').default;
app.use('/static', express.static('static'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const instance = axios.create({
  baseURL: 'https://api.revenuecat.com/v1/',
  timeout: 5000,
  headers: {'X-Platform': 'stripe','Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RC_STRIPE_KEY}`}
});

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
  res.render('checkout', {
    prices: prices.data || [],
    CURRENCY_SYMBOLS: CURRENCY_SYMBOLS
  });
})

app.get('/success', async (req, res) => {
  if (!req.query.session_id){
    // We should fail, but for now it's ok
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
    res.render('success'); 
    return;
  }

  const session = await stripe.checkout.sessions.retrieve(req.query.session_id, {
    expand: ['invoice.subscription'],
  });
  let response;

  try{
    const body = {
      fetch_token: session.subscription,
      app_user_id: session.customer,
      attributes: {
        '$displayName': {
          value: session.customer_details.name
        },
        '$email': {
          value: session.customer_details.email
        },
      }
    };

    console.log(body)
    response = await instance.post('/receipts', body)
  } catch(e){
    res.json({ e: e})
    return;
  }

  res.render('success', { subscriber: response.data.subscriber });
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
    success_url: `http://${req.headers.host}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `http://${req.headers.host}/cancel`,
  });

  res.redirect(303, session.url);
});

app.listen(process.env.PORT || 8080, () => console.log('Running on port 8080'));