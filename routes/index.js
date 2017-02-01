var express = require('express');
var router = express.Router();
var MongoClient = require('mongodb').MongoClient;
var request = require('request');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Heat Map' });
});

router.post('/add', function(req, res, next) {
  console.log(JSON.stringify(req.body));
  const street = req.body.street;
  const postcode = req.body.postcode;
  const mode = req.body.mode;
  if (!Boolean(street) || !Boolean(postcode) || !Boolean(mode)) {
    res.status(400).send('Need values for address');
  } else {
    const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(street) +
      '&components=postal_code:' +
      encodeURIComponent(postcode) +
      '|country=DE&key=' +
      process.env.PRIVATE_GOOGLE_API_KEY;
    request(geocodingUrl, function(err, response, body) {
      if (err) {
        res.status(500).send('Geocoding error: ' + err);
      } else if (response.statusCode !== 200) {
        res.status(response.statusCode).send('Geocoding error');
      } else {
        const jsonBody = JSON.parse(body);
        const result = jsonBody.results[0];
        const address = {
          'address': result.formatted_address,
          'latitude': result.geometry.location.lat,
          'longitude': result.geometry.location.lng,
          'mode': mode
        };
        console.log(address);
        MongoClient.connect(process.env.MONGODB_URI, function(err, db) {
          console.log('Database connection', err);
          if (err) {
            res.status(500).send('Database error');
          } else {
            let addresses = db.collection('addresses');
            addresses.updateOne({'address': address.address}, address, {'upsert': true}, function (err, result) {
              if (err) {
                res.status(500).send('Database error: ' + err);
              } else {
                console.log('Update result', result.matchedCount, result.modifiedCount, result.upsertedCount);
                res.redirect(303, '/');
              }
              db.close();
            });
          }
        });
      }
    });
  }
});

module.exports = router;
