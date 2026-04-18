module.exports = {
    STATES: [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
        "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
        "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
        "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
        "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
        "Uttar Pradesh", "Uttarakhand", "West Bengal", "Central"
    ],

    STATUS: {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        RUNNING: 'running',
        COMPLETED: 'completed',
        FAILED: 'failed'
    },

    ENTITY_TYPES: {
        SCHEME: 'scheme',
        TENDER: 'tender',
        RECRUITMENT: 'recruitment'
    },

    ADMIN_ROLES: {
        ADMIN: 'admin',
        MODERATOR: 'moderator'
    },

    ACTIONS: {
        APPROVE: 'approve',
        REJECT: 'reject',
        EDIT: 'edit',
        DELETE: 'delete',
        TRIGGER_CRAWLER: 'trigger_crawler'
    }
};
