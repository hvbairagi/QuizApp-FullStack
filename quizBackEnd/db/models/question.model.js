const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 1,
    trim: true,
  },
  _paperId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
});

const Question = mongoose.model("Question", QuestionSchema);

module.exports = { Question };
