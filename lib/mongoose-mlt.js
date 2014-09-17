var mongoose = require('mongoose');
var natural = require('natural');
var _ = require('underscore');

module.exports = exports = function moreLikeThis(Model, options) {

  var mlt = function(query, skip, callback) {
    if ('function' === typeof skip) {
      callback = skip;
      skip = null;
    }
    Model.mlt._tfidf(query, function(err, scores) {
      if (err) return callback(err);
      var query = { $text: { $search: Model.mlt._makeQuery(scores) } };
      // Skip itself when called from a model
      if (skip) query._id = { $ne: skip };
      Model.find(query, {score: {$meta: 'textScore'}}, {sort: {score: {$meta: 'textScore'}}}, function(err, mlt) {
        if (err) callback(err);
        else callback(null, mlt);
      });
    });
  }

  // Method wrappers
  Model.prototype.mlt = function(callback) { mlt(this.toJSON(), this._id.toString(), callback); };
  Model.mlt = function(query, callback) {
    if (query instanceof mongoose.Types.ObjectId || ('string' === typeof query && mongoose.Types.ObjectId.isValid(query))) {
      // Get model when using an ObjectId as a seed document
      Model.findById(query, null, {lean: true}, function(err, model) {
        if (err) return callback(err);
        if (!model) return callback(null, []);
        mlt(model, model._id, callback);
      });
    } else if (_.isObject(query)) {
      mlt(query instanceof mongoose.Document ? query.toJSON() : query, query._id, callback);
    } else {
      return callback(new Error('Invalid parameter'));
    }
  };

  // Parse text content of seed document
  Model.mlt._parseQuery = function(query) {
    return _.chain(query).values().flatten().join(' ').value().toString().toLowerCase();
  };

  // Term frequency vector
  Model.mlt._tf = function(document) {
    var words = natural.PorterStemmer.tokenizeAndStem(Model.mlt._parseQuery(document));
    return _.reduce(words, function(memo, word) {
      if (!_.contains(natural.stopwords, word) && _.isNaN(++memo[word])) {
          memo[word] = 1;
      }
      return memo;
    }, {});
  };

  // Get inverse document frequency scores
  Model.mlt._idf = function(query, callback) {
    // Tokenize query terms
    var tokenizer = new natural.WordTokenizer();
    var terms = _.chain(tokenizer.tokenize(Model.mlt._parseQuery(query))).difference(natural.stopwords).uniq().value();
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
  };

  // Get the tf-idf score for each term
  Model.mlt._tfidf = function(query, callback) {
    var stem = natural.PorterStemmer.stem;
    var tf = this._tf(query);
    this._idf(query, function(err, idfs) {
      if (err) return callback(err);
      var tfidfs = {};
      _.each(idfs, function(idf, term) {
        tfidfs[term] = idf * tf[stem(term)];
      });
      callback(null, tfidfs);
    });
  };

  // Create text search query based on tf-idf scores
  Model.mlt._makeQuery = function(scores) {
    // Determine lowest score to use as divider
    var min = _.min(_.values(scores));
    return _.chain(scores).map(function(score, term) {
      // Boost higher scoring terms by repeating them in the query
      return _.times(Math.floor(score / min), function() {
        return term;
      });
    }).flatten().join(' ').value();
  };
}
