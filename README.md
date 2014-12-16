Mongoose MoreLikeThis
=====================

[Mongoose MLT](https://github.com/vkareh/mongoose-mlt) is a
[mongoose](http://mongoosejs.com/) plugin that adds a _more-like-this_ query
generation algorithm for searching relevant content.

It is heavily based on Lucene's _MoreLikeThis_, which uses
[tf-idf](http://en.wikipedia.org/wiki/Tf-idf) statistics to characterize
document relevance based a small set of terms.

Usage
-----
Define your schema, define your text indexes, and then load the plugin:
```javascript
var MySchema = new mongoose.Schema({ ... });
MySchema.index({ '$**': 'text' });
MySchema.plugin(require('mongoose-mlt'), {
  limit: 100,
  tfThreshold: 2,
  termLimit: 25
});
```
The following are the possible options you can pass to the plugin:

* `limit`: Same as `mongoose.models.Model.find().limit(n)`.
  It limits the number of returned results.
  Default is 100.
* `tfThreshold`: Determines the minimium term-frequency for any given term to be considered for search.
  Use a higher number to provide faster matching when using large document bodies.
  Use a lower number to provide more accurate matching when using small document bodies.
  Default is 2.
* `termLimit`: Limits the maximum number of terms to be used for search.
  It uses the `n` highest scoring terms.
  Use a higher number to provide more but less relevant results.
  Use a lower number to provide fewer but more relevant results.
  Default is 25.

There are several ways to use the `mlt` functionality. They all require a seed
document or ObjectId:

##### Static method with a seed JSON object:
```javascript
var jsonSeed = { title: 'Seed', body: 'This is the seed document' };
MyModel.mlt(jsonSeed, callback);
```

##### Static method with a seed Mongoose model:
```javascript
var modelSeed = new MyModel({ title: 'Seed', body: 'This is the seed document' });
MyModel.mlt(modelSeed, callback);
```

##### Static method with a seed `_id`
```javascript
MyModel.find({ title: 'Seed', body: 'This is the seed document' }, function(err, modelSeed) {
  MyModel.mlt(modelSeed._id, callback);
});
```

The `mlt` method itself takes the following parameters:
```javascript
MyModel.mlt(seed, conditions, fields, options, callback);
```
where `seed` is the seed document or `_id`, and `conditions`, `fields`,
`options`, and `callback` are the same as you would pass to `Model.find()`.

The `callback` for `mlt` has `err` (which is `null` on success) and `results`
(which is an array of relevant documents, sorted by similarity).
