var mongoose = require('mongoose');
var natural = require('natural');
var _ = require('underscore');

module.exports = exports = function moreLikeThis(schema, options) {

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
    opts = opts || {};
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

  // Parse text content of seed document
  schema.static('_mltParseQuery', function(query) {
    return _.chain(query).values().flatten().join(' ').value().toString().toLowerCase();
  });

  // Term frequency vector
  schema.static('_mltTf', function(document) {
    var Model = this;
    var words = natural.PorterStemmer.tokenizeAndStem(Model._mltParseQuery(document));
    return _.reduce(words, function(memo, word) {
      if (!_.contains(natural.stopwords, word) && _.isNaN(++memo[word])) {
          memo[word] = 1;
      }
      return memo;
    }, {});
  });

  // Get inverse document frequency scores
  schema.static('_mltIdf', function(query, callback) {
    var Model = this;
    // Tokenize query terms
    var tokenizer = new natural.WordTokenizer();
    var terms = _.chain(tokenizer.tokenize(Model._mltParseQuery(query))).difference(natural.stopwords).uniq().value();
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
      var idfScores = {};
      _.each(matching, function(count, match) {
        if (count && corpus !== count) idfScores[match] = Math.log(corpus / count);
        if (--remaining === 0) callback(null, idfScores);
      });
    }
  });

  // Get the tf-idf score for each term
  schema.static('_mltTfIdf', function(query, callback) {
    var Model = this;
    var stem = natural.PorterStemmer.stem;
    var tf = Model._mltTf(query);
    Model._mltIdf(query, function(err, idfs) {
      if (err) return callback(err);
      var tfidfs = {};
      _.each(idfs, function(idf, term) {
        tfidfs[term] = idf * tf[stem(term)];
      });
      callback(null, tfidfs);
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
