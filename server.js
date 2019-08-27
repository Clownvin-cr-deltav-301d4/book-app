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

  function parseBook(bookData) {
    const title = bookData.title ? bookData.title : 'Untitled';
    const subtitle = bookData.subtitle;
    const authors = bookData.authors ? bookData.authors.join(', ') : 'Unknown author';
    const publisher = bookData.publisher;
    const description = bookData.description ? bookData.description : 'No description';
    const thumbnail = bookData.imageLinks.thumbnail ? bookData.imageLinks.thumbnail : 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg';
    return new Book(title, subtitle, authors, publisher, description, thumbnail);
  }

  class Book {
    constructor(title, subtitle, authors, publisher, description, thumbnail) {
      this.title = title ? title : 'Untitled';
      this.subtitle = subtitle;
      this.authors = authors ? authors : 'Unknown Author';
      this.publisher = publisher;
      this.description = description ? description : 'No description';
      this.thumbnail = thumbnail;
    }
  }

  function handleError(res, error, status = 500) {
    res.render('error', {status: status, error: error.message ? error.message : error});
  }

  function getErrorHandler(res, status = 500) {
    return (error) => handleError(res, error, status);
  }

  app.get('/', (req, res) => {
    res.render('index');
  });

  app.post('/searches', (req, res) => {
    try {
      let query = req.body.query.replace(' ', '+');
      if (req.body.search_type === 'title') {
        query = `intitle:${query}`;
      } else if (req.body.search_type === 'author') {
        query = `inauthor:${query}`;
      }
      superagent.get(`https://www.googleapis.com/books/v1/volumes?q=${query}`)
        .then(results => {
          const books = results.body.items.map(book => parseBook(book.volumeInfo));
          res.render('results', { results: books });
        })
        .catch(getErrorHandler(res));
    } catch (error) {
      handleError(res, error.message);
    }
  });

  app.post('*', (req, res) => handleError(res, 'Path not found...', 404));

  app.get('*', (req, res) => handleError(res, 'Path not found...', 404));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Listening for requests on port: ${PORT}`);
  });
})();
