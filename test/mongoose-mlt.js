var expect = require('chai').expect;
var mongoose = require('mongoose');
var mongooseMLT = require('../lib/mongoose-mlt');
var _ = require('underscore');

var Content, ContentSchema, Student, StudentSchema, seed, student, _id;
describe('Mongoose mlt plugin', function() {
  before(function(done) {
    // Connect to new test database
    mongoose.connect('mongodb://localhost/mongoose-mlt-test', done);
  });

  describe('Text based', function() {
    before(function(done) {
      ContentSchema = mongoose.Schema({ content: String });
      ContentSchema.index({ 'content': 'text' });
      ContentSchema.plugin(mongooseMLT);
      Content = mongoose.model('Content', ContentSchema);
      // Add data to test database
      var contents = require('./fixtures/content.json');
      var remaining = contents.length;
      contents.forEach(function(content) {
        var content = new Content(content);
        content.save(function(err) {
          if (err) return done(err);
          if (--remaining === 0) done();
        });
      });
    });

    it('should add the mlt plugin to the schema', function() {
      expect(Content).to.contain.key('mlt');
      expect(Content.mlt).to.be.a.function;
    });

    it('should determine which indexed fields to use', function() {
      var fields = Content._mltGetIndexedFields();
      expect(fields).to.be.ok;
      expect(fields).to.be.an.instanceof(Array);
      expect(fields).to.have.members(['content']);
    });

    it('should calculate the term frequency vector for the seed document', function() {
      seed = { content: 'This node document is a good example document about node' };
      var tf = Content._mltTf(seed);
      expect(tf).to.be.ok;
      expect(tf).to.have.keys(['docum', 'good', 'exampl', 'node']);
      expect(tf['docum']).to.equal(2);
      expect(tf['good']).to.equal(1);
      expect(tf['exampl']).to.equal(1);
      expect(tf['node']).to.equal(2);
    });

    it('should calculate the inverse document frequency score of all terms in the seed', function(done) {
      Content._mltIdf(seed, function(err, idf) {
        if (err) return done(err);
        expect(idf).to.be.ok;
        expect(idf).to.have.keys(['example', 'node']);
        expect(idf).to.not.have.keys(['document', 'good']);
        expect(idf['example']).to.be.a.number;
        expect(idf['example']).to.equal(Math.log(4 / 1))
        expect(idf['node']).to.be.a.number;
        expect(idf['node']).to.equal(Math.log(4 / 3));
        done();
      });
    });

    it('should calculate the tf-idf score for each term in the seed', function(done) {
      Content._mltTfIdf(seed, function(err, tfidf) {
        if (err) return done(err);
        expect(tfidf).to.be.ok;
        expect(tfidf).to.have.keys(['example', 'node']);
        expect(tfidf).to.not.have.keys(['document', 'good']);
        expect(tfidf['example']).to.be.a.number;
        expect(tfidf['example']).to.equal(Math.log(4 / 1) * 1)
        expect(tfidf['node']).to.be.a.number;
        expect(tfidf['node']).to.equal(Math.log(4 / 3) * 2);
        done();
      });
    });

    it('should generate a query based on the tf-idf scores', function(done) {
      Content._mltTfIdf(seed, function(err, tfidf) {
        if (err) return done(err);
        var query = Content._mltMakeQuery(tfidf);
        expect(query).to.be.ok;
        expect(query).to.equal('node example example');
        done();
      });
    });

    it('should retrieve a list of similar documents ordered by likeness', function(done) {
      Content.mlt(seed, function(err, mlt) {
        if (err) return done(err);
        expect(mlt).to.be.ok;
        expect(mlt).to.be.an.instanceof(Array);
        expect(mlt).to.have.length(3);
        expect(mlt[0].content).to.be.ok;
        expect(mlt[0].content).to.equal('this document is about node. it has node examples.');
        expect(mlt[1].content).to.be.ok;
        expect(mlt[1].content).to.equal('this document is about node.');
        expect(mlt[2].content).to.be.ok;
        expect(mlt[2].content).to.equal('this document is about ruby and node.');
        done();
      });
    });
  });

  describe('Parameter based', function() {
    before(function(done) {
      StudentSchema = mongoose.Schema({ name: String, university: String, graduationYear: Number, department: String, program: String, degree: String });
      StudentSchema.index({ '$**': 'text' });
      StudentSchema.plugin(mongooseMLT);
      Student = mongoose.model('Student', StudentSchema);
      // Add data to test database
      var students = require('./fixtures/students.json');
      var remaining = students.length;
      students.forEach(function(student) {
        var student = new Student(student);
        student.save(function(err) {
          if (err) return done(err);
          if (--remaining === 0) done();
        });
      });
    });

    it('should add the mlt plugin to the schema', function() {
      expect(Student).to.contain.key('mlt');
      expect(Student.mlt).to.be.a.function;
    });

    it('should determine which indexed fields to use', function() {
      var fields = Student._mltGetIndexedFields();
      expect(fields).to.be.ok;
      expect(fields).to.be.an.instanceof(Array);
      expect(fields).to.have.members(['name', 'university', 'graduationYear', 'department', 'program', 'degree']);
    });

    it('should calculate the term frequency vector for the seed document', function() {
      seed = {
        name: 'Victor Kareh',
        university: 'University of Michigan',
        graduationYear: 2005,
        department: 'College of Engineering',
        program: 'Computer Engineering',
        degree: 'BSE'
      };
      var tf = Student._mltTf(seed);
      expect(tf).to.be.ok;
      expect(tf).to.have.keys(['2005', 'victor', 'kareh', 'univers', 'michigan', 'colleg', 'engin', 'comput', 'bse']);
      expect(tf['2005']).to.equal(1);
      expect(tf['victor']).to.equal(1);
      expect(tf['kareh']).to.equal(1);
      expect(tf['univers']).to.equal(1);
      expect(tf['michigan']).to.equal(1);
      expect(tf['colleg']).to.equal(1);
      expect(tf['engin']).to.equal(2);
      expect(tf['comput']).to.equal(1);
      expect(tf['bse']).to.equal(1);
    });

    it('should calculate the inverse document frequency score of all terms in the seed', function(done) {
      Student._mltIdf(seed, function(err, idf) {
        if (err) return done(err);
        expect(idf).to.be.ok;
        expect(idf).to.have.keys(['university', 'michigan', 'college', 'engineering', 'computer', 'bse']);
        expect(idf).to.not.have.keys(['2005', 'victor', 'kareh']);
        expect(idf['university']).to.be.a.number;
        expect(idf['university']).to.equal(Math.log(5 / 4));
        expect(idf['michigan']).to.be.a.number;
        expect(idf['michigan']).to.equal(Math.log(5 / 3));
        expect(idf['college']).to.be.a.number;
        expect(idf['college']).to.equal(Math.log(5 / 3));
        expect(idf['engineering']).to.be.a.number;
        expect(idf['engineering']).to.equal(Math.log(5 / 3));
        expect(idf['computer']).to.be.a.number;
        expect(idf['computer']).to.equal(Math.log(5 / 3));
        expect(idf['bse']).to.be.a.number;
        expect(idf['bse']).to.equal(Math.log(5 / 3));
        done();
      });
    });

    it('should calculate the tf-idf score for each term in the seed', function(done) {
      Student._mltTfIdf(seed, function(err, tfidf) {
        if (err) return done(err);
        expect(tfidf).to.be.ok;
        expect(tfidf).to.have.keys(['university', 'michigan', 'college', 'engineering', 'computer', 'bse']);
        expect(tfidf).to.not.have.keys(['2005', 'victor', 'kareh']);
        expect(tfidf['university']).to.be.a.number;
        expect(tfidf['university']).to.equal(Math.log(5 / 4));
        expect(tfidf['michigan']).to.be.a.number;
        expect(tfidf['michigan']).to.equal(Math.log(5 / 3));
        expect(tfidf['college']).to.be.a.number;
        expect(tfidf['college']).to.equal(Math.log(5 / 3));
        expect(tfidf['engineering']).to.be.a.number;
        expect(tfidf['engineering']).to.equal(Math.log(5 / 3) * 2);
        expect(tfidf['computer']).to.be.a.number;
        expect(tfidf['computer']).to.equal(Math.log(5 / 3));
        expect(tfidf['bse']).to.be.a.number;
        expect(tfidf['bse']).to.equal(Math.log(5 / 3));
        done();
      });
    });

    it('should generate a query based on the tf-idf scores', function(done) {
      Student._mltTfIdf(seed, function(err, tfidf) {
        if (err) return done(err);
        var query = Student._mltMakeQuery(tfidf);
        expect(query).to.be.ok;
        expect(query).to.equal('college college engineering engineering engineering engineering university computer computer michigan michigan bse bse');
        done();
      });
    });

    it('should retrieve a list of similar documents ordered by likeness', function(done) {
      Student.mlt(seed, function(err, mlt) {
        if (err) return done(err);
        expect(mlt).to.be.ok;
        expect(mlt).to.be.an.instanceof(Array);
        expect(mlt).to.have.length(4);
        expect(mlt[0].name).to.be.ok;
        expect(mlt[0].name).to.equal('Alice');
        expect(mlt[1].name).to.be.ok;
        expect(mlt[1].name).to.equal('Bob');
        expect(mlt[2].name).to.be.ok;
        expect(mlt[2].name).to.equal('David');
        expect(mlt[3].name).to.be.ok;
        expect(mlt[3].name).to.equal('Cecilia');
        done();
      });
    });
  });

  describe('Methods', function() {
    before(function(done) {
      student = new Student(seed);
      _id = student._id.toString();
      student.save(done);
    });

    it('should find similar documents based on _id', function(done) {
      Student.mlt(_id, 'name', function(err, mlt) {
        if (err) return done(err);
        expect(mlt).to.be.ok;
        expect(mlt).to.be.an.instanceof(Array);
        expect(mlt).to.have.length(4);
        expect(mlt[0].name).to.be.ok;
        expect(mlt[0].name).to.equal('Alice');
        expect(mlt[1].name).to.be.ok;
        expect(mlt[1].name).to.equal('Bob');
        expect(mlt[2].name).to.be.ok;
        expect(mlt[2].name).to.equal('David');
        expect(mlt[3].name).to.be.ok;
        expect(mlt[3].name).to.equal('Cecilia');
        done();
      });
    });

    it('should return an empty array for non-existent _ids', function(done) {
      Student.mlt('123456789012345678901234', function(err, mlt) {
        if (err) return done(err);
        expect(mlt).to.be.ok;
        expect(mlt).to.be.an.instanceof(Array);
        expect(mlt).to.have.length(0);
        done();
      });
    });

    it('should return an error for invalid _ids', function(done) {
      Student.mlt('123456', function(err, mlt) {
        expect(err).to.be.ok;
        expect(err).to.be.an.instanceof(Error);
        expect(mlt).to.not.be.ok;
        done();
      });
    });
  });

  after(function(done) {
    // Drop test database
    mongoose.connection.db.dropDatabase(done);
  });

});
