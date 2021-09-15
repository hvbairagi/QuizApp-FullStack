const mongoose = require("mongoose");

const QuestionPaperSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 1,
    trim: true,
  },
  // with auth
  _userId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
});

const QuestionPaper = mongoose.model("QuestionPaper", QuestionPaperSchema);

module.exports = { QuestionPaper };
