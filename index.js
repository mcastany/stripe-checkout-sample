require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_KEY);
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const { uuid } = require('uuidv4');
const app = express();
const axios = require('axios').default;


// Put these statements before you define any routes.
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.set('trust proxy', 1) // trust first proxy

app.use('/static', express.static('static'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cookieSession({
  name: 'session',
  keys: [ 'revenuecat' ],

  // Cookie Options
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))

const instance = axios.create({
  baseURL: 'https://api.revenuecat.com/v1/',
  timeout: 5000,
  headers: {
    'X-Platform': 'stripe',
    // 'X-Platform-Account': 'straccb885da6c52',
    'Accept': 'application/json', 
    'Content-Type': 'application/json', 
    'Authorization': `Bearer ${process.env.RC_STRIPE_KEY}`}
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

function generateAnonUser(){
  return  {
    anonymous: true,
    id: `$RCAnonymousID:${uuid()}`,
    email: 'anonymous@revenuecat.com'
  };
}

// MAP RC identifiers to Stripe intervals
function getRCPackage(pri){
  const timeMapping = {
    month: 'monthly',
    year: 'annual',
    week: 'weekly',
  };

  if (pri.type === 'recurring'){
    if (pri.recurring.interval_count === 1){
    }
    
    let prefix = '';
    if (pri.recurring.interval_count === 3 && pri.recurring.interval === 'month') {
      return 'three_month';
    }

    if (pri.recurring.interval_count === 6  && pri.recurring.interval === 'month') {
      return 'six_month';
    }

    return `${prefix}${timeMapping[pri.recurring.interval]}`;
  } else {
    return 'lifetime'
  }
}

app.get('/', async (req, res) => {
  if (!req.session.rc_user){
    req.session.rc_user = generateAnonUser();
  }

  const response = await instance.get(`/subscribers/${req.session.rc_user.id}`);
  const subscriptions = Object.keys(response.data.subscriber.subscriptions);
  let { data: prices} = await stripe.prices.list({
    limit: 10,
    expand: ['data.product']
  });

  if (req.session.use_offerings){
    const offerings = await instance.get(`/subscribers/${req.session.rc_user.id}/offerings`)

    const offer = offerings.data.offerings.filter(x => x.identifier === offerings.data.current_offering_id)[0];

    // HACK 
    // - we need to map RC products to Stripe products, but the duration is on prices
    // - we'll filter prices depending on the duration of the packages (assuming from the RC package)
    
    // We'll create a list of identifiers 
    const productIdentifiers = offer.packages.map(p => `${p.identifier.replace('$rc_','')}/${p.platform_product_identifier}`);

    // Filter prices that match duration and product
    prices = prices.filter(pri => productIdentifiers.includes(`${getRCPackage(pri)}/${pri.product.id}`));
  }

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.render('checkout', {
    prices: prices.sort((a,b) => { return a.product.id > b.product.id ? 1 : -1}),
    rc_user: req.session.rc_user,
    subscriptions,
    CURRENCY_SYMBOLS: CURRENCY_SYMBOLS
  });
})

app.get('/user', async (req, res) => {
  const response = await instance.get(`/subscribers/${req.session.rc_user.id}`);
  res.render('user', {
    user: response.data.subscriber
  });
})

app.get('/configure', async (req, res) => {
  const users = await stripe.customers.list({
    limit: 100,
    // test_clock: 'clock_1MP5WbB4vov9kwgjgCJqF5L0'
  });

  if (!req.session.rc_user){
     req.session.rc_user = generateAnonUser();
  }

  if (users.data.length === 0){
    req.session.use_stripe_user = false;
  }

  res.render('configure', {
    stripe_users: users.data,
    rc_user: req.session.rc_user,
    use_stripe_user: req.session.use_stripe_user,
    stripe_user: req.session.stripe_user || {},
    use_offerings: req.session.use_offerings,
    no_code: req.session.no_code
  });
})

app.post('/configure', async (req, res) => {
  req.session.use_offerings = req.body.use_offerings === 'on';

  if (req.body.rc_id){
    req.session.rc_user = {
      id:  req.body.rc_id,
      email: req.body.rc_email
    }
  } else {
    req.session.rc_user = generateAnonUser();
  }

  req.session.use_stripe_user = req.body.use_stripe_customer === 'on';
  
  if (req.body.user_picker && req.body.user_picker.startsWith('cus_')){
    const sUser = await stripe.customers.retrieve(req.body.user_picker);
    req.session.stripe_user = {
      id: req.body.user_picker,
      email: sUser.email
    }
  } 

  if (req.body.no_code){
    req.session.no_code = true;
  }

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.redirect(303, '/');
})

app.get('/success', async (req, res) => {
  if (!req.query.session_id){
    // We should fail, but for now it's ok
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
    res.render('success', { subscriber: { original_app_user_id: req.session.rc_user.id, entitlements: { } } }); 
    return;
  }

  const session = await stripe.checkout.sessions.retrieve(req.query.session_id, {
    expand: ['subscription'],
  });
  let response, body;

  if (req.session.no_code) {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
    res.render('success', { subscriber: { original_app_user_id: req.session.rc_user.id, entitlements: { } }, subscription_id: session.subscription, checkout_session_id: req.query.session_id }); 
    return;
  }

  try{
    body = {
      fetch_token: session.subscription,
      app_user_id: req.session.rc_user.id,
      attributes: {
        '$displayName': {
          value: session.customer_details.name
        },
        '$email': {
          value: session.customer_details.email
        },
        'stripe_id': {
          // Store the customer id as attribute in case we need it
          value: session.customer
        }
      }
    };

    response = await instance.post('/receipts', body)
  } catch(e){
    console.log(JSON.stringify(e))
    res.json({ e: e, body})
    return;
  }

  res.render('success', { subscriber: response.data.subscriber, subscription_id: session.subscription, checkout_session_id: req.query.session_id });
})

app.get('/cancel', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.render('cancel');
})

app.post('/create-checkout-session', async (req, res) => {
  if (!req.body.price_id){
    res.redirect(303, '/');
    return;
  }

  let options = {
    line_items: [{
      price: req.body.price_id,
      quantity: 1,
    }, ],
    mode: 'subscription',
    success_url: `http://${req.headers.host}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `http://${req.headers.host}/`,
    metadata: {
      'origin': 'web'
    }
  };

  if (req.session.stripe_user){
    options.customer = req.session.stripe_user.id;
  }

  if (req.session.no_code){
    options.metadata.app_user_id = req.session.rc_user.id;
  }

  const session = await stripe.checkout.sessions.create(options);

  res.redirect(303, session.url);
});

app.listen(process.env.PORT || 8080, () => console.log('Running on port 8080'));