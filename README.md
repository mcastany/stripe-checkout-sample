# stripe-checkout-sample

1. Get an account in Stripe and configure this repository with the stripe key

2. Go to revenuecat and create a Stripe application and paste the public key in this repository

3. Run `npm start`

## Configure Products in Stripe

1. Go to Stripe dashboard and create some products with their prices

2. You can add a metadata field called description with the following structure. This will be rendered in the home page

```
<ul class="list-unstyled mt-3 mb-4">
    <li>20 users included</li>
    <li>10 GB of storage</li>
    <li>Priority email support</li>
    <li>Help center access</li>
</ul>
```

## Using offerings

If you want to use offerings, you can enable it in the configure section. What offerings will do is display only those products and prices that are configured as packages. It will use the package duration (based on the identifier) and the product ID to do the filtering