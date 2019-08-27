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

  //Major functionality...

  /*
    Check out these functional APIs!
    They're nested to all hell, but meh. It'd be even longer without the nesting.

    Would be neat to actually discuss how to build functional APIs like this, so that I'm not
    just taking shots in the dark at the format.
  */
  function when(path) {
    return {
      selectFrom: function (table) {
        return {
          where: function (...columns) {
            let sql = `SELECT * FROM ${table} WHERE `;
            columns.forEach((column, index) => {
              sql += `${column}=$${index + 1}`;
              if (index + 1 < columns.length) {
                sql += ' AND ';
              }
            });
            sql += ';';
            return {
              are: function (...values) {
                return {
                  then: function (onHit) {
                    return {
                      else: function (onMiss) {
                        app
                          .get(path, (request, response) => {
                            let currValues = typeof values[0] === 'function' ? values[0](request) : values;
                            if (!Array.isArray(currValues)) {
                              currValues = [currValues];
                            }
                            console.log(sql);
                            client
                              .query(sql, currValues)
                              .then(recieved => {
                                if (recieved.rows.length === 0) {
                                  onMiss(request, response);
                                } else {
                                  onHit(recieved, response, request);
                                }
                              })
                              .catch(getErrorHandler(response));
                          });
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    };
  }

  function onHit() {
    return {
      ifOlderThan: function (maxAge) {
        this.maxAge = maxAge;
        const outer = this;
        return {
          deleteFrom: function (table) {
            outer.table = table;
            return {
              where: function (...columns) {
                outer.sql = `DELETE FROM ${outer.table} WHERE `;
                columns.forEach((column, index) => {
                  outer.sql += `${column}=$${index + 1}`;
                  if (index + 1 < columns.length) {
                    outer.sql += ' AND ';
                  }
                });
                outer.sql += ';';
                return {
                  are: function (...values) {
                    outer.values = values;
                    return {
                      then: function (callback) {
                        outer.onMiss = callback;
                        return outer;
                      }
                    };
                  }
                };
              }
            };
          }
        };
      },
      send: function (rowIndex) {
        const context = this;
        return function (results, response, request) {
          if (context.maxAge && Number(results.rows[0].created_at) + context.maxAge < Date.now()) {
            let values = typeof context.values[0] === 'function' ? context.values[0](request) : context.values;
            if (!Array.isArray(values)) {
              values = [values];
            }
            console.log(`Clearing ${context.table} cache...`);
            console.log(context.sql);
            client.query(context.sql, values)
              .then(() => context.onMiss(request, response))
              .catch(getErrorHandler(response));
          } else if (rowIndex !== undefined) {
            response.send(results.rows[rowIndex]);
          } else {
            response.send(results.rows);
          }
        };
      }
    };
  }

  function onMiss() {
    return {
      getUrlForRequest: function (urlBuilder) {
        const headers = [];
        return {
          set: function (header, value) {
            headers.push({ header: header, value: value });
            return this;
          },
          then: function (responseParser) {
            return function (request, response) {
              const url = urlBuilder(request).replace(' ', '%20');
              console.log(url);
              const pending = superagent.get(url);
              headers.forEach(header => pending.set(header.header, header.value));
              pending.then(responseData => {
                const parsed = responseParser(responseData, request);
                if (Array.isArray(parsed)) {
                  parsed.forEach(result => result.save());
                  response.send(parsed);
                } else {
                  parsed.save().then((newVal) => response.send(newVal));
                }
              })
                .catch(getErrorHandler(response));
            };
          }
        };
      }
    };
  }

  const insertInto = (table, object, extra, onResults) => {
    const columns = [...Object.keys(object), 'created_at'];
    const values = [...Object.values(object), Date.now()];
    let valueReplacer = '$1';
    for (let i = 1; i < values.length; i++) {
      valueReplacer += `, $${i + 1}`;
    }
    let sql = `INSERT INTO ${table} (${columns}) VALUES(${valueReplacer}) ON CONFLICT DO NOTHING`;
    if (extra) {
      sql += ` ${extra}`;
    }
    sql = `${sql};`;
    console.log(sql);
    const pending = client.query(sql, values).catch(error => {
      console.log(`We seem to have encountered a bug: ${error}`);
      console.log(values);
    });
    if (onResults) {
      return pending.then(onResults);
    }
    return pending;
  };

  app.get('/', (req, res) => {
    res.render('index');
  });

  app.post('/search', (req, res) => {
    console.log(req.body);
    let query = req.body.query.replace(' ', '+');
    if (req.body.search_type === 'author') {
      query = `inauthor:${query}`;
    }
    superagent.get(`https://www.googleapis.com/books/v1/volumes?q=${query}`).then(results => {
      console.log(results.body.items);
      console.log(Object.keys(results.body.items));
      res.render('results', results.body.items);
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Listening for requests on port: ${PORT}`);
  });
})();
