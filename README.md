# Office Finder

Office Finder was written to consider potential new office locations based on
the people's addresses, but it could be used to select any shared location
conveniently reachable by everyone.

## Setup

Office Finder uses Node.js and MongoDB. The map and all location information
is fetched from the Google Maps APIs. For running, it needs a few environment
variables to be set:
* **MONGODB_URI**: The URI of your MongoDB instance
* **OFFICE_CITY**: The name of the city where the office will be located
* **OFFICE_COUNTRY_CODE**: The 2-letter country code of the office country
* **PUBLIC_GOOGLE_API_KEY**: A Google API key with the Maps Javascript API
enabled. This will be embedded in the Web pages served to the user, so
remember to restrict it by referrer.
* **PRIVATE_GOOGLE_API_KEY**: A Google API key to be used by the Node backend,
with Geocoding, Distance Matrix, and Time Zone APIs enabled. This will remain
internal to the backend, but if possible, restricting by IP address is sensible.

## License

Office Finder is copyright by its authors as listed in the AUTHORS file. It is
licensed under the Apache License version 2.0. The license text is in the
LICENSE file in the repository.
