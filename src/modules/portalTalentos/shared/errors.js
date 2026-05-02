class PortalTalentosError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'PortalTalentosError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = {
  PortalTalentosError,
};
