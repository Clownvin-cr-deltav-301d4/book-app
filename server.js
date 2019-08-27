(() => {
  'use strict';
  require('dotenv').config();
  const express = require('express');
  const app = express();
  const cors = require('cors');
  app.use(cors());
  const pg = require('pg');
  const client = new pg.Client(process.env.DATABASE_URL);
  client.connect();

  const superagent = require('superagent');

  app.set('view engine', 'ejs');
  app.use(express.static('./public'));
  app.use(express.urlencoded({ extended: true }));

  function handleError(error, response) {
    response.status(error.status || 500).send(error.message);
  }

  function getErrorHandler(response) {
    return (error) => handleError(error, response);
  }

  class Book {
    constructor(title, subtitle, authors, publisher, description, thumbnail) {
      this.title = title;
      this.subtitle = subtitle;
      this.authors = authors;
      this.publisher = publisher;
      this.description = description;
      this.thumbnail = thumbnail;
    }
  }

  app.get('/', (req, res) => {
    res.render('index');
  });

  app.post('/searches', (req, res) => {
    console.log(req.body);
    let query = req.body.query.replace(' ', '+');
    if (req.body.search_type === 'author') {
      query = `inauthor:${query}`;
    }
    superagent.get(`https://www.googleapis.com/books/v1/volumes?q=${query}`)
      .then(results => {
        const books = results.body.items.map(book => new Book(book.volumeInfo.title, book.volumeInfo.subtitle, book.volumeInfo.authors, book.volumeInfo.publisher, book.volumeInfo.description, book.volumeInfo.imageLinks.thumbnail));
        res.render('results', {results: books});
      })
      .catch(error => {
        console.log(error);
        res.render('error', {status: 500, error: error.message});
      });
  });

  app.post('*', (req, res) => {
    res.render('error', {status: 404, error: 'This path could not be found...'});
  });

  app.get('*', (req, res) => {
    res.render('error', {status: 404, error: 'This path could not be found...'});
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Listening for requests on port: ${PORT}`);
  });
})();
