var mongoose = require('mongoose');
var natural = require('natural');
var _ = require('underscore');

module.exports = exports = function moreLikeThis(schema, options) {
  options = options || {};
  options.limit = options.limit || 100;
  options.tfThreshold = options.tfThreshold || 2;
  options.termLimit = options.termLimit || 25;

  var mlt = function(query, fields, opts, callback) {
    var Model = this;
    Model._mltTfIdf(query, function(err, scores) {
      if (err) return callback(err);
      var query = { $text: { $search: Model._mltMakeQuery(scores) } };
      // Convert field list to correct format
      if ('string' === typeof fields) {
        fields = fields.split(' ');
        fields = _.object(fields, _.map(fields, function(field) {
          return field.charAt(0) === '-' ? 0 : 1;
        }));
      }
      // Add search score to field list
      fields.score = { $meta: 'textScore' };
      // Skip itself when called from a model
      if (opts.seed) {
        query._id = { $ne: opts.seed };
        delete opts.seed;
      }
      // Sort by search score
      opts.sort = { score: { $meta: 'textScore' } };
      Model.find(query, fields, opts, function(err, mlt) {
        if (err) callback(err);
        else callback(null, mlt);
      });
    });
  }

  // Static method wrapper
  schema.static('mlt', function(query, fields, opts, callback) {
    var Model = this;
    if ('function' === typeof fields) {
      callback = fields;
      fields = {};
      opts = {};
    } else if ('function' === typeof opts) {
      callback = opts;
      opts = {};
    }
    fields = fields || {};
    opts = opts || {};
    opts.limit = opts.limit || options.limit;
    if (query instanceof mongoose.Types.ObjectId || ('string' === typeof query && mongoose.Types.ObjectId.isValid(query))) {
      // Get model when using an ObjectId as a seed document
      Model.findById(query, null, {lean: true}, function(err, model) {
        if (err) return callback(err);
        if (!model) return callback(null, []);
        opts.seed = model._id;
        mlt.call(Model, model, fields, opts, callback);
      });
    } else if (_.isObject(query)) {
      if (query._id) opts.seed = query._id;
      mlt.call(Model, query instanceof mongoose.Document ? query.toJSON() : query, fields, opts, callback);
    } else {
      return callback(new Error('Invalid parameter'));
    }
  });

  // Get indexed fields
  schema.static('_mltGetIndexedFields', _.memoize(function() {
    var fields = _.chain(this.schema.indexes()).pluck(0).filter(function(index) {
      return _.contains(_.values(index), 'text');
    }).first().keys().value();
    if ('$**' === fields[0]) {
      fields = [];
      this.schema.eachPath(function(path) {
        if (!_.contains(['__v', '_id'], path)) fields.push(path);
      });
    }
    return fields;
  }, function() {
    return this.modelName;
  }));

  // Parse text content of seed document
  schema.static('_mltParseQuery', function(query) {
    var fields = this._mltGetIndexedFields();
    var tokenizer = new natural.WordTokenizer();
    return _.chain(query).pick(fields).values().map(function(terms) {
      return tokenizer.tokenize(terms.toString());
    }).flatten().invoke('toLowerCase').difference(natural.stopwords).value();
  });

  // Calculate term frequency vector
  schema.static('_mltTf', function(terms) {
    var Model = this;
    if (!_.isArray(terms)) {
      terms = Model._mltParseQuery(terms);
    }

    // Calculate frequency of stemmed terms
    var stem = natural.PorterStemmer.stem;
    var tf = _.reduce(terms, function(memo, term) {
      term = stem(term);
      if (_.isNaN(++memo[term])) {
          memo[term] = 1;
      }
      return memo;
    }, {});

    // Remove terms below the frequency threshold
    if (options.tfThreshold > 1) {
      _.each(tf, function(f, t) {
        if (f < options.tfThreshold) {
          delete tf[t];
        }
      });
    }
    return tf;
  });

  // Get inverse document frequency scores
  schema.static('_mltIdf', function(terms, callback) {
    var Model = this;
    if (!_.isArray(terms)) {
      terms = Model._mltParseQuery(terms);
    }
    terms = _.uniq(terms);
    var remaining = terms.length + 1;
    var _corpus, _matching = {};

    // Count all documents in the corpus
    Model.count(function(err, count) {
      if (err) return callback(err);
      _corpus = count;
      if (--remaining === 0) __idf(_corpus, _matching);
    });

    // Count matching documents for each term
    _.each(terms, function(term) {
      Model.count({ $text: { $search: term } }, function(err, count) {
        if (err) return callback(err);
        _matching[term] = count;
        if (--remaining === 0) __idf(_corpus, _matching);
      });
    });

    // Calculate IDF for each term
    function __idf(corpus, matching) {
      var remaining = _.size(matching);
      var idf = {};
      _.each(matching, function(count, match) {
        if (count && corpus !== count) idf[match] = Math.log(corpus / count);
        if (--remaining === 0) callback(null, idf);
      });
    }
  });

  // Get the tf-idf score for each term
  schema.static('_mltTfIdf', function(terms, callback) {
    var Model = this;
    if (!_.isArray(terms)) {
      terms = Model._mltParseQuery(terms);
    }
    // Get term frequency vector
    var tf = Model._mltTf(terms);

    // Remove terms below the frequency threshold
    var stem = natural.PorterStemmer.stem;
    if (options.tfThreshold > 1) {
      terms = _.filter(terms, function(term) {
        return _.has(tf, stem(term));
      });
    }

    // Get inverse document frequency vector
    Model._mltIdf(terms, function(err, idfv) {
      if (err) return callback(err);
      var tfidf = {};
      var remaining = options.termLimit;
      _.all(idfv, function(idf, term) {
        tfidf[term] = idf * tf[stem(term)];
        if (--remaining === 0) return false;
        return true;
      });
      callback(null, tfidf);
    });
  });

  // Create text search query based on tf-idf scores
  schema.static('_mltMakeQuery', function(scores) {
    // Determine lowest score to use as divider
    var min = _.min(_.values(scores));
    return _.chain(scores).map(function(score, term) {
      // Boost higher scoring terms by repeating them in the query
      return _.times(Math.floor(score / min), function() {
        return term;
      });
    }).flatten().join(' ').value();
  });
}
