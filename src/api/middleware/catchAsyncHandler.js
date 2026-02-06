const catchAsyncHandler = (thisFunction) => {
  return (req, res, next) => {
    Promise.resolve(thisFunction(req, res, next)).catch(next);
  };
};

export default catchAsyncHandler;
