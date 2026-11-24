SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
        Email NVARCHAR(254) NOT NULL,
        DisplayName NVARCHAR(100) NOT NULL,
        PasswordHash VARCHAR(256) NOT NULL,
        Role VARCHAR(20) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'recruiter',
        IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
        FailedLoginCount INT NOT NULL CONSTRAINT DF_Users_FailedLoginCount DEFAULT 0,
        LockoutUntil DATETIME2(3) NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Users_Email UNIQUE (Email),
        CONSTRAINT CK_Users_Role CHECK (Role IN ('admin', 'recruiter'))
    );
END;

IF OBJECT_ID(N'dbo.UserSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSessions (
        TokenHash CHAR(64) NOT NULL CONSTRAINT PK_UserSessions PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        ExpiresAt DATETIME2(3) NOT NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_UserSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_UserSessions_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );
    CREATE INDEX IX_UserSessions_UserId ON dbo.UserSessions(UserId);
    CREATE INDEX IX_UserSessions_ExpiresAt ON dbo.UserSessions(ExpiresAt);
END;

IF OBJECT_ID(N'dbo.RecruiterWorkspaces', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RecruiterWorkspaces (
        UserId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_RecruiterWorkspaces PRIMARY KEY,
        StateJson NVARCHAR(MAX) NOT NULL,
        Revision INT NOT NULL CONSTRAINT DF_RecruiterWorkspaces_Revision DEFAULT 1,
        UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_RecruiterWorkspaces_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_RecruiterWorkspaces_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE,
        CONSTRAINT CK_RecruiterWorkspaces_Json CHECK (ISJSON(StateJson) = 1),
        CONSTRAINT CK_RecruiterWorkspaces_Revision CHECK (Revision > 0)
    );
END;

COMMIT TRANSACTION;
