const DomainException = require('./DomainException');
const ValidationException = require('./ValidationException');
const UnauthorizedException = require('./UnauthorizedException');
const ForbiddenException = require('./ForbiddenException');
const NotFoundException = require('./NotFoundException');
const ConflictException = require('./ConflictException');

module.exports = {
  DomainException,
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
};
