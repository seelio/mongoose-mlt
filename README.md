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
MySchema.plugin(require('mongoose-mlt'));
```

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

The callback for `mlt` has `err` (which is `null` on success) and `results`
(which is an array of relevant documents, sorted by similarity).
