var express = require('express');
var router = express.Router();
var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var async = require('async');
var zip = require('zip-array').zip;

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Heat Map',
    apiKey: process.env.PUBLIC_GOOGLE_API_KEY
  });
});

router.get('/setup', function(req, res, next) {
  res.render('setup');
});

router.get('/heatmap', function(req, res, next) {
  MongoClient.connect(process.env.MONGODB_URI, function(err, db) {
    if (err) {
      res.status(500).send('Database error: ' + err);
    } else {
      let stationsCollection = db.collection('stations');
      let durationsCollection = db.collection('durations');
      stationsCollection.find().toArray(function(err, stations) {
        async.map(stations, function(station, callback) {
          durationsCollection.find({'station': station.station}).toArray(function(err, durations) {
            if (err) {
              callback(err);
            } else {
              let weight = durations.map(function(duration) { return duration.duration * duration.duration; }).
                reduce(function(a, b) { return a + b; }, 0);
              callback(null, {
                'latitude': station.latitude,
                'longitude': station.longitude,
                'weight': weight
              });
            }
          });
        }, function(err, stationWeights) {
          if (err) {
            res.status(500).send('Database error: ' + err);
          } else {
            res.status(200).json(stationWeights);
          }
          db.close();
        });
      });
    }
  });
});

router.post('/setup/stations', function(req, res, next) {
  var stationNames = req.body.stations.split(/\r?\n/).slice(0, -1);
  console.log('Setting up ' + stationNames.length + ' stations');
  console.log(stationNames);
  let stationCount = 0;
  async.eachLimit(stationNames, 50, function(stationName, callback) {
    const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(stationName) +
      '&components=locality:' + process.env.OFFICE_CITY +
      '|country:' + process.env.OFFICE_COUNTRY_CODE +
      '&key=' + process.env.PRIVATE_GOOGLE_API_KEY;
    request(geocodingUrl, function(err, response, body) {
      if (err) {
        setTimeout(callback, 1000, err);
      } else if (response.statusCode !== 200) {
        setTimeout(callback, 1000, new Error(body));
      } else {
        const jsonBody = JSON.parse(body);
        const result = jsonBody.results[0];
        if (!result.types.includes('transit_station')) {
          setTimeout(callback, 1000);
        } else {
          const station = {
            'station': result.formatted_address,
            'latitude': result.geometry.location.lat,
            'longitude': result.geometry.location.lng
          };
          console.log(station);
          MongoClient.connect(process.env.MONGODB_URI, function(err, db) {
            if (err) {
              setTimeout(callback, 1000, err);
            } else {
              let stations = db.collection('stations');
              stations.updateOne({'station': station.station}, station, {'upsert': true}, function(err, result) {
                setTimeout(callback, 1000, err);
                if (!err) {
                  stationCount += 1;
                }
                db.close();
              });
            }
          });
        }
      }
    });
  }, function(err) {
    console.log('Set up ' + stationCount + ' stations');
    if (err) {
      res.status(500).send('Error setting up stations: ' + err);
    } else {
      res.status(303).redirect('/');
    }
  });
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
      '|country=' + process.env.OFFICE_COUNTRY_CODE +
      '&key=' + process.env.PRIVATE_GOOGLE_API_KEY;
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
          'mode': mode,
          'timestamp': new Date().getTime()
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
                db.close();
              } else if (result.upsertedCount === 0) {
                res.redirect(303, '/');
                db.close();
              } else {
                let stationsCollection = db.collection('stations');
                stationsCollection.find().toArray(function (err, stations) {
                  if (err) {
                    res.status(500).send('Database error: ' + err);
                    db.close();
                  } else {
                    let monday = new Date();
                    monday.setDate(monday.getDate() + (7 - monday.getDay()) % 7 + 1);
                    monday.setHours(9, 0, 0, 0);
                    let stationsString = stations.map(function(station) {
                      return '' + station.latitude + ',' + station.longitude;
                    }).join('|');
                    const distanceMatrixUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' +
                      address.latitude + ',' + address.longitude +
                      '&destinations=' + stationsString +
                      '&mode=' + mode +
                      '&departure_time=' + (monday.getTime() / 1000) +
                      '&key=' + process.env.PRIVATE_GOOGLE_API_KEY;
                    request(distanceMatrixUrl, function(err, response, body) {
                      if (err) {
                        res.status(500).send('Distance calculation error: ' + err);
                        db.close();
                      } else if (response.statusCode !== 200) {
                        res.status(response.statusCode).send('Distance calculation error');
                        db.close();
                      } else {
                        const jsonBody = JSON.parse(body);
                        if (!jsonBody.rows[0]) {
                          addresses.deleteOne(address, null, function(err, result) {
                            res.status(500).send('Distance calculation error: ' + jsonBody.error_message);
                            db.close();
                          });
                          return;
                        }
                        const durations = jsonBody.rows[0].elements.map(function(element) {
                          return element.duration.value / 3600;
                        });
                        const stationNames = stations.map(function(station) {
                          return station.station;
                        });
                        const stationsWithDurations = zip(stationNames, durations);
                        const addressDurations = stationsWithDurations.map(function(stationDuration) {
                          return {
                            'address': address.address,
                            'station': stationDuration[0],
                            'duration': stationDuration[1]
                          };
                        });
                        console.log(addressDurations);
                        let durationsCollection = db.collection('durations');
                        durationsCollection.insertMany(addressDurations, function(err, result) {
                          if (err) {
                            res.status(500).send('Database error: ' + err);
                          } else {
                            res.status(303).redirect('/');
                          }
                          db.close();
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  }
});

module.exports = router;
