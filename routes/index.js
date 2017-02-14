var express = require('express');
var lodash = require('lodash');
var request = require('request');
var async = require('async');
var zip = require('zip-array').zip;
var googleMapsClient = require('@google/maps').createClient({
  key: process.env.PRIVATE_GOOGLE_API_KEY
});

var router = express.Router();

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
  let stationsCollection = req.db.collection('stations');
  let durationsCollection = req.db.collection('durations');
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
    });
  });
});

router.post('/setup/stations', function(req, res, next) {
  var stationNames = req.body.stations.split(/\r?\n/).slice(0, -1);
  console.log('Setting up ' + stationNames.length + ' stations');
  console.log(stationNames);
  let stationCount = 0;
  async.eachLimit(stationNames, 50, function(stationName, callback) {
    googleMapsClient.geocode({
      address: stationName,
      components: {
        locality: process.env.OFFICE_CITY,
        country: process.env.OFFICE_COUNTRY_CODE
      }
    }, function(err, response) {
      if (err) {
        callback(err);
      } else {
        const result = response.json.results[0];
        if (!result.types.includes('transit_station')) {
          callback();
        } else {
          const station = {
            'station': result.formatted_address,
            'latitude': result.geometry.location.lat,
            'longitude': result.geometry.location.lng
          };
          console.log(station);
          let stations = req.db.collection('stations');
          stations.updateOne({'station': station.station}, station, {'upsert': true}, function(err, result) {
            callback(err);
            if (!err) {
              stationCount += 1;
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
    googleMapsClient.geocode({
      address: street,
      components: {
        postal_code: postcode,
        country: process.env.OFFICE_COUNTRY_CODE
      }
    }, function(err, response) {
      if (err) {
        res.status(500).send('Geocoding error: ' + err);
      } else {
        const result = response.json.results[0];
        const address = {
          'address': result.formatted_address,
          'latitude': result.geometry.location.lat,
          'longitude': result.geometry.location.lng,
          'mode': mode,
          'timestamp': new Date().getTime()
        };
        console.log(address);
        let addresses = req.db.collection('addresses');
        addresses.updateOne({'address': address.address}, address, {'upsert': true}, function (err, result) {
          if (err) {
            res.status(500).send('Database error: ' + err);
          } else if (result.upsertedCount === 0) {
            res.redirect(303, '/');
          } else {
            let stationsCollection = req.db.collection('stations');
            stationsCollection.find().toArray(function (err, stations) {
              if (err) {
                res.status(500).send('Database error: ' + err);
              } else {
                let monday = new Date();
                monday.setDate(monday.getDate() + (7 - monday.getDay()) % 7 + 1);
                monday.setHours(9, 0, 0, 0);
                let chunkedStations = lodash.chunk(stations, 25);
                async.mapLimit(chunkedStations, 1, function(stations, callback) {
                  googleMapsClient.distanceMatrix({
                    origins: [ address ],
                    destinations: stations,
                    mode: mode,
                    departure_time: monday
                  }, function(err, response) {
                    if (err) {
                      callback(err);
                    } else {
                      if (!response.json.rows[0]) {
                        callback(new Error(response.json.error_message));
                      } else {
                        const durations = response.json.rows[0].elements.map(function(element) {
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
                        callback(null, addressDurations);
                      }
                    }
                  });
                }, function(err, addressDurationsCollection) {
                  if (err) {
                    addresses.deleteOne(address, null, function(_, result) {
                      res.status(500).send('Distance calculation error: ' + err);
                    });
                  } else {
                    let durationsCollection = req.db.collection('durations');
                    let addressDurations = lodash.flatten(addressDurationsCollection);
                    durationsCollection.insertMany(addressDurations, function(err, result) {
                      if (err) {
                        res.status(500).send('Database error: ' + err);
                      } else {
                        res.status(303).redirect('/');
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
