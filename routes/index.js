var express = require('express');
var lodash = require('lodash');
var request = require('request');
var async = require('async');
var zip = require('zip-array').zip;
var Promise = require('bluebird');
var googleMapsClient = require('@google/maps').createClient({
  key: process.env.PRIVATE_GOOGLE_API_KEY,
  Promise: Promise
});

var router = express.Router();

function square(duration) {
  return duration * duration;
}

function sum(durations) {
  return durations.reduce(function(a, b) { return a + b; }, 0);
}

function getNextMonday() {
  return googleMapsClient.geocode({
    address: process.env.OFFICE_CITY,
    components: {
      country: process.env.OFFICE_COUNTRY_CODE
    }
  }).asPromise().then(function(response) {
    const result = response.json.results[0];
    return googleMapsClient.timezone({
      location: response.json.results[0].geometry.location,
      timestamp: new Date()
    }).asPromise();
  }).then(function(response) {
    let monday = new Date();
    monday.setDate(monday.getDate() + (7 - monday.getDay()) % 7 + 1);
    const hours = 9 - (response.json.rawOffset + response.json.dstOffset) / 3600;
    monday.setUTCHours(hours, 0, 0, 0);
    console.log('Next Monday', monday);
    return monday;
  });
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Heat Map',
    apiKey: process.env.PUBLIC_GOOGLE_API_KEY,
    city: process.env.OFFICE_CITY,
    countryCode: process.env.OFFICE_COUNTRY_CODE
  });
});

router.get('/setup', function(req, res, next) {
  res.render('setup');
});

router.get('/heatmap', function(req, res, next) {
  let stationsCollection = req.db.collection('stations');
  let durationsCollection = req.db.collection('durations');
  stationsCollection.find().toArray().then(function(stations) {
    return new Promise(function(resolve, reject) {
      async.map(stations, function(station, callback) {
        durationsCollection.find({'station': station.station}).toArray(function(err, durations) {
          if (err) {
            callback(err);
          } else {
            let transformedDurations = durations.map(function(duration) { return duration.duration; }).
              map(square);
            let weight = sum(transformedDurations);
            callback(null, {
              'station': station.station,
              'latitude': station.latitude,
              'longitude': station.longitude,
              'weight': weight
            });
          }
        });
      }, function(err, stationWeights) {
        if (err) {
          reject(err);
        } else {
          stationWeights.sort(function(sw1, sw2) { return sw1.weight - sw2.weight; });
          resolve(stationWeights);
        }
      });
    });
  }).then(function(stationWeights) {
    res.status(200).json(stationWeights);
  }).catch(function(err) {
    res.status(500).send('Database error: ' + err);
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
    }).asPromise().then(function(response) {
      const result = response.json.results[0];
      if (result.types.includes('transit_station')) {
        const station = {
          'station': result.formatted_address,
          'latitude': result.geometry.location.lat,
          'longitude': result.geometry.location.lng
        };
        console.log(station);
        return station;
      } else {
        return {};
      }
    }).then(function(station) {
      if (station.station) {
        stations = req.db.collection('stations');
        return stations.updateOne({station: station.station}, station, {upsert: true});
      } else {
        return null;
      }
    }).then(function(result) {
      stationCount += !!result;
      callback();
    }).catch(function(err) {
      callback(err);
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
    let addressPromise = googleMapsClient.geocode({
      address: street,
      components: {
        postal_code: postcode,
        country: process.env.OFFICE_COUNTRY_CODE
      }
    }).asPromise().then(function(response) {
      const result = response.json.results[0];
      const address = {
        'address': result.formatted_address,
        'latitude': result.geometry.location.lat,
        'longitude': result.geometry.location.lng,
        'mode': mode,
        'timestamp': new Date().getTime()
      };
      console.log(address);
      return address;
    }).then(function(address) {
      let addresses = req.db.collection('addresses');
      return addresses.updateOne({address: address.address}, address, {upsert: true});
    }).then(function(result) {
      let addresses = req.db.collection('addresses');
      return addresses.findOne({_id: result.result.upserted[0]._id});
    });
    let stationsCollection = req.db.collection('stations');
    let stationsPromise = stationsCollection.find().toArray();
    let mondayPromise = getNextMonday();
    Promise.join(addressPromise, stationsPromise, mondayPromise).spread(function(address, stations, monday) {
      if (!address) {
        return [];
      }
      let chunkedStations = lodash.chunk(stations, 25);
      return new Promise(function(resolve, reject) {
        async.mapLimit(chunkedStations, 1, function(stations, callback) {
          googleMapsClient.distanceMatrix({
            origins: [ address ],
            destinations: stations,
            mode: mode,
            departure_time: monday
          }).asPromise().then(function(response) {
            if (response.json.rows[0]) {
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
            } else {
              callback(new Error(response.json.error_message));
            }
          });
        }, function(err, addressDurationsCollection) {
          if (err) {
            let addresses = req.db.collection('addresses');
            addresses.deleteOne(address, null, function(_, result) {
              reject(err);
            });
          } else {
            resolve(lodash.flatten(addressDurationsCollection));
          }
        });
      });
    }).then(function(addressDurations) {
      if (addressDurations.length > 0) {
        let durationsCollection = req.db.collection('durations');
        return durationsCollection.insertMany(addressDurations);
      }
    }).then(function() {
      res.status(303).redirect('/');
    }).catch(function(err) {
      res.status(500).send('Error: ' + err);
    });
  }
});

module.exports = router;
