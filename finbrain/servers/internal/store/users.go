package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Store) CreateUser(ctx context.Context, username, displayName, passwordHash string) (User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var u User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (display_name)
		VALUES ($1)
		RETURNING id, display_name, is_active, created_at, updated_at`,
		displayName).
		Scan(&u.ID, &u.DisplayName, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return User{}, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, identifier, secret)
		VALUES ($1, 'password', $2, $3)`,
		u.ID, username, passwordHash)
	if err != nil {
		return User{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, u.ID); err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) GetPasswordIdentity(ctx context.Context, username string) (PasswordIdentity, error) {
	var p PasswordIdentity
	err := s.pool.QueryRow(ctx, `
		SELECT i.id, i.user_id, i.identifier, i.secret, i.must_change_password,
		       u.display_name, u.is_active, u.created_at, u.updated_at
		FROM user_identities i
		JOIN users u ON u.id = i.user_id
		WHERE i.provider = 'password' AND i.identifier = $1 AND u.is_active`,
		username).
		Scan(&p.ID, &p.UserID, &p.Identifier, &p.Secret, &p.MustChangePassword,
			&p.User.DisplayName, &p.User.IsActive, &p.User.CreatedAt, &p.User.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return PasswordIdentity{}, ErrNotFound
	}
	if err != nil {
		return PasswordIdentity{}, err
	}
	p.User.ID = p.UserID
	p.User.MustChangePassword = p.MustChangePassword
	return p, nil
}

func (s *Store) GetPasswordIdentityByUserID(ctx context.Context, userID int64) (PasswordIdentity, error) {
	var p PasswordIdentity
	err := s.pool.QueryRow(ctx, `
		SELECT i.id, i.user_id, i.identifier, i.secret, i.must_change_password,
		       u.display_name, u.is_active, u.created_at, u.updated_at
		FROM user_identities i
		JOIN users u ON u.id = i.user_id
		WHERE i.provider = 'password' AND i.user_id = $1 AND u.is_active`,
		userID).
		Scan(&p.ID, &p.UserID, &p.Identifier, &p.Secret, &p.MustChangePassword,
			&p.User.DisplayName, &p.User.IsActive, &p.User.CreatedAt, &p.User.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return PasswordIdentity{}, ErrNotFound
	}
	if err != nil {
		return PasswordIdentity{}, err
	}
	p.User.ID = p.UserID
	p.User.MustChangePassword = p.MustChangePassword
	return p, nil
}

func (s *Store) GetUser(ctx context.Context, id int64) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.display_name, u.is_active,
		       COALESCE(i.must_change_password, false) AS must_change_password,
		       u.created_at, u.updated_at
		FROM users u
		LEFT JOIN user_identities i ON i.user_id = u.id AND i.provider = 'password'
		WHERE u.id = $1 AND u.is_active`,
		id).
		Scan(&u.ID, &u.DisplayName, &u.IsActive, &u.MustChangePassword, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (s *Store) CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) (Session, error) {
	var sess Session
	err := s.pool.QueryRow(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at, last_used_at)
		VALUES ($1, $2, $3, now())
		RETURNING id, user_id, token_hash, expires_at, created_at, last_used_at, revoked_at`,
		userID, tokenHash, expiresAt).
		Scan(&sess.ID, &sess.UserID, &sess.TokenHash, &sess.ExpiresAt, &sess.CreatedAt, &sess.LastUsedAt, &sess.RevokedAt)
	return sess, err
}

func (s *Store) ResolveSession(ctx context.Context, tokenHash string, now time.Time) (Session, error) {
	var sess Session
	err := s.pool.QueryRow(ctx, `
		UPDATE sessions
		SET last_used_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
		RETURNING id, user_id, token_hash, expires_at, created_at, last_used_at, revoked_at`,
		tokenHash, now).
		Scan(&sess.ID, &sess.UserID, &sess.TokenHash, &sess.ExpiresAt, &sess.CreatedAt, &sess.LastUsedAt, &sess.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return sess, err
}

func (s *Store) RevokeSession(ctx context.Context, tokenHash string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE sessions
		SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`,
		tokenHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) RevokeUserSessions(ctx context.Context, userID int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE sessions
		SET revoked_at = now()
		WHERE user_id = $1 AND revoked_at IS NULL`,
		userID)
	return err
}

func (s *Store) RevokeUserSessionsExcept(ctx context.Context, userID int64, keepTokenHash string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE sessions
		SET revoked_at = now()
		WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
		userID, keepTokenHash)
	return err
}

func (s *Store) SetPassword(ctx context.Context, userID int64, passwordHash string, mustChange bool) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE user_identities
		SET secret = $1, must_change_password = $2
		WHERE user_id = $3 AND provider = 'password'`,
		passwordHash, mustChange, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
