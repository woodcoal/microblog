/** src/pages/index.astro 的页面级脚本。 */
import { actions } from 'astro:actions';
import type { RecommendItem, RecommendUserItem } from '@/services/recommend.service';

/** 仅在已登录用户的推荐区域存在时加载两个独立数据源。 */
(async () => {
	const postsPanel = document.getElementById('recommend-posts-panel') as HTMLElement | null;
	const postsList = document.getElementById('recommend-posts-list') as HTMLElement | null;
	const postsStatus = document.getElementById('recommend-posts-status') as HTMLElement | null;
	const usersPanel = document.getElementById('recommend-users-panel') as HTMLElement | null;
	const usersList = document.getElementById('recommend-users-list') as HTMLElement | null;
	const usersStatus = document.getElementById('recommend-users-status') as HTMLElement | null;
	const usersTitle = document.getElementById('recommend-users-title') as HTMLElement | null;
	if (!postsPanel || !postsList || !postsStatus || !usersPanel || !usersList || !usersStatus)
		return;
	const modeLabels = JSON.parse(postsList.dataset.modeLabels ?? '{}') as Record<string, string>;
	const getModeLabel = (mode: string) => modeLabels[mode] ?? mode;
	const postsPanelElement: HTMLElement = postsPanel;
	const postsListElement: HTMLElement = postsList;
	const postsStatusElement: HTMLElement = postsStatus;
	const usersPanelElement: HTMLElement = usersPanel;
	const usersListElement: HTMLElement = usersList;
	const usersStatusElement: HTMLElement = usersStatus;
	const usersTitleElement: HTMLElement | null = usersTitle;
	const usersFeedback = document.getElementById('recommend-users-feedback');

	function setStatus(status: HTMLElement, message = '') {
		status.replaceChildren();
		if (message) status.append(document.createTextNode(message));
	}

	function showError(status: HTMLElement, message: string, retry: () => void) {
		setStatus(status, message);
		const retryButton = document.createElement('button');
		retryButton.type = 'button';
		retryButton.className = 'btn btn-outline recommend-retry';
		retryButton.textContent = '重试';
		retryButton.addEventListener('click', retry);
		status.appendChild(retryButton);
	}

	function showSkeletons(list: HTMLElement, kind: 'post' | 'user') {
		const fragment = document.createDocumentFragment();
		for (let index = 0; index < (kind === 'post' ? 4 : 3); index += 1) {
			const skeleton = document.createElement('div');
			skeleton.className = `recommend-skeleton recommend-${kind}-skeleton`;
			skeleton.setAttribute('aria-hidden', 'true');
			fragment.appendChild(skeleton);
		}
		list.replaceChildren(fragment);
	}

	function showUsersEmptyState() {
		setStatus(usersStatusElement, '暂时没有可推荐的用户，可去发现频道看看。');
		const link = document.createElement('a');
		link.href = '/weibo';
		link.className = 'recommend-empty-link';
		link.textContent = '去发现频道';
		usersStatusElement.appendChild(link);
		return link;
	}

	function focusUsersHeading() {
		usersTitleElement?.focus();
	}

	function removeFollowedUserCard(card: HTMLElement) {
		const nextFocusTarget = card.nextElementSibling?.querySelector<HTMLElement>(
			'a[href], button:not([disabled])'
		);
		let isRemoved = false;
		const finishRemoval = () => {
			if (isRemoved) return;
			isRemoved = true;
			card.remove();

			if (nextFocusTarget?.isConnected) {
				nextFocusTarget.focus();
				return;
			}
			if (!usersListElement.children.length) {
				showUsersEmptyState().focus();
				return;
			}
			focusUsersHeading();
		};
		card.classList.add('is-removing');
		card.addEventListener('animationend', finishRemoval, { once: true });
		window.setTimeout(finishRemoval, 240);
	}

	const onboarding = document.getElementById('interest-onboarding');
	const interestFeedback = onboarding?.querySelector<HTMLElement>('[data-interest-feedback]');
	const interestButtons = onboarding?.querySelectorAll<HTMLButtonElement>(
		'[data-interest-kind][data-interest-id]'
	);
	interestButtons?.forEach((button) =>
		button.addEventListener('click', () => {
			button.setAttribute(
				'aria-pressed',
				String(button.getAttribute('aria-pressed') !== 'true')
			);
		})
	);
	async function saveInterestSelection(skip: boolean) {
		if (!onboarding) return;
		const selected = Array.from(
			onboarding.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]')
		);
		const tagIds = selected
			.filter((button) => button.dataset.interestKind === 'tag')
			.map((button) => button.dataset.interestId!)
			.filter(Boolean);
		const categoryIds = selected
			.filter((button) => button.dataset.interestKind === 'category')
			.map((button) => button.dataset.interestId!)
			.filter(Boolean);
		const controls = onboarding.querySelectorAll<HTMLButtonElement>('button');
		controls.forEach((button) => {
			button.disabled = true;
		});
		if (interestFeedback)
			interestFeedback.textContent = skip ? '正在跳过偏好设置…' : '正在保存你的选择…';
		try {
			const result = await actions.saveInterests({ tagIds, categoryIds, skip });
			if (result.error) throw new Error(result.error.message);
			onboarding.remove();
			await loadPosts();
		} catch {
			controls.forEach((button) => {
				button.disabled = false;
			});
			if (interestFeedback) interestFeedback.textContent = '暂时无法保存，请重试或稍后设置。';
		}
	}
	onboarding
		?.querySelector<HTMLButtonElement>('[data-interest-save]')
		?.addEventListener('click', () => void saveInterestSelection(false));
	onboarding
		?.querySelector<HTMLButtonElement>('[data-interest-skip]')
		?.addEventListener('click', () => void saveInterestSelection(true));

	function plainText(value: string, length: number) {
		const text = value
			.replace(/[#*`>\-[\]()!]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return text.length > length ? `${text.slice(0, length)}…` : text;
	}

	const interactionIcons = {
		like: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
		bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
		comment:
			'M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-4.5-1.3L3 21l2.3-4.5A8.5 8.5 0 1 1 21 11.5z'
	} as const;

	function safeCount(value: number | undefined): number {
		return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
	}

	function createInteractionStat(kind: keyof typeof interactionIcons, count: number) {
		const stat = document.createElement('span');
		stat.className = [
			'recommend-preview-stat',
			`recommend-preview-stat-${kind}`,
			...(count > 0 ? ['is-active'] : [])
		].join(' ');
		stat.setAttribute('aria-hidden', 'true');
		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		icon.setAttribute('viewBox', '0 0 24 24');
		icon.setAttribute('fill', 'none');
		icon.setAttribute('stroke-width', '2');
		icon.setAttribute('stroke-linecap', 'round');
		icon.setAttribute('stroke-linejoin', 'round');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', interactionIcons[kind]);
		icon.append(path);
		stat.append(icon, document.createTextNode(String(count)));
		return stat;
	}

	function renderPosts(items: RecommendItem[]) {
		const fragment = document.createDocumentFragment();
		for (const item of items) {
			const previewItem = document.createElement('article');
			previewItem.className = 'home-preview-item';
			const profileUrl = `/${item.user.username}`;
			const postUrl = `${profileUrl}/${item.id}`;
			const mode = getModeLabel(item.mode);
			const avatarLink = document.createElement('a');
			avatarLink.className = 'home-preview-avatar-link';
			avatarLink.href = profileUrl;
			avatarLink.setAttribute('aria-label', `查看 ${item.user.displayName} 的主页`);
			if (item.user.avatarUrl) {
				const avatar = document.createElement('img');
				avatar.className = 'home-preview-avatar';
				avatar.src = item.user.avatarUrl;
				avatar.alt = '';
				avatar.loading = 'lazy';
				avatarLink.append(avatar);
			} else {
				const avatar = document.createElement('span');
				avatar.className = 'home-preview-avatar home-preview-avatar-placeholder';
				avatar.setAttribute('aria-hidden', 'true');
				avatar.textContent = item.user.displayName.charAt(0).toUpperCase();
				avatarLink.append(avatar);
			}
			const copy = document.createElement('a');
			copy.className = 'home-preview-copy';
			copy.href = postUrl;
			const title = document.createElement('strong');
			title.textContent = plainText(item.title || item.content, 50) || '查看内容';
			title.title = item.title || plainText(item.content, 200);
			const meta = document.createElement('small');
			meta.textContent = `${mode} · ${item.user.displayName}`;
			const stats = document.createElement('span');
			stats.className = 'recommend-preview-stats';
			const likeCount = safeCount(item.likeCount);
			const bookmarkCount = safeCount(item.bookmarkCount);
			const commentCount = safeCount(item.commentCount);
			stats.setAttribute(
				'aria-label',
				`点赞 ${likeCount}，收藏 ${bookmarkCount}，评论 ${commentCount}`
			);
			stats.append(
				createInteractionStat('like', likeCount),
				createInteractionStat('bookmark', bookmarkCount),
				createInteractionStat('comment', commentCount)
			);
			copy.append(title, meta);
			previewItem.append(avatarLink, copy, stats);
			fragment.append(previewItem);
		}
		postsListElement.replaceChildren(fragment);
	}

	function renderUsers(items: RecommendUserItem[]) {
		const fragment = document.createDocumentFragment();
		for (const item of items) {
			const card = document.createElement('article');
			card.className = 'recommend-user-card';

			const profileUrl = `/${item.username}`;
			if (item.avatarUrl) {
				const avatarLink = document.createElement('a');
				avatarLink.href = profileUrl;
				const avatar = document.createElement('img');
				avatar.src = item.avatarUrl;
				avatar.alt = `${item.displayName} 的头像`;
				avatar.className = 'recommend-user-avatar';
				avatar.loading = 'lazy';
				avatarLink.appendChild(avatar);
				card.appendChild(avatarLink);
			} else {
				const avatarLink = document.createElement('a');
				avatarLink.href = profileUrl;
				avatarLink.className = 'recommend-user-avatar-placeholder';
				avatarLink.setAttribute('aria-label', `查看 ${item.displayName} 的主页`);
				avatarLink.textContent = item.displayName.charAt(0).toUpperCase();
				card.appendChild(avatarLink);
			}

			const copy = document.createElement('div');
			copy.className = 'recommend-user-copy';
			const name = document.createElement('a');
			name.href = profileUrl;
			name.className = 'recommend-user-name';
			name.textContent = item.displayName;
			const handle = document.createElement('p');
			handle.className = 'recommend-user-handle';
			handle.textContent = `@${item.username}`;
			const bio = document.createElement('p');
			bio.className = 'recommend-user-bio';
			bio.textContent = item.bio || '来看看这位创作者的公开动态。';
			const social = document.createElement('p');
			social.className = 'recommend-user-social';
			social.textContent =
				item.mutualFollowCount > 0 ? `${item.mutualFollowCount} 位共同关注` : '活跃创作者';
			copy.append(name, handle, bio, social);

			const followButton = document.createElement('button');
			followButton.type = 'button';
			followButton.className = 'btn btn-primary recommend-follow-button';
			followButton.textContent = '关注';
			followButton.setAttribute('aria-label', `关注 ${item.displayName}`);
			followButton.addEventListener('click', async () => {
				if (followButton.disabled || card.classList.contains('is-removing')) return;
				followButton.disabled = true;
				followButton.textContent = '关注中…';
				if (usersFeedback) usersFeedback.textContent = '';
				try {
					const result = await actions.toggleFollow({ username: item.username });
					if (result.data?.following) {
						if (usersFeedback) usersFeedback.textContent = `已关注 ${item.displayName}`;
						removeFollowedUserCard(card);
						return;
					}
					throw new Error('关注未完成');
				} catch {
					if (usersFeedback)
						usersFeedback.textContent = `关注 ${item.displayName} 失败，请重试。`;
				} finally {
					if (card.isConnected && !card.classList.contains('is-removing')) {
						followButton.disabled = false;
						followButton.textContent = '重试关注';
						followButton.setAttribute('aria-label', `重试关注 ${item.displayName}`);
					}
				}
			});
			card.append(copy, followButton);
			fragment.appendChild(card);
		}
		usersListElement.replaceChildren(fragment);
	}

	async function loadPosts() {
		postsPanelElement.setAttribute('aria-busy', 'true');
		showSkeletons(postsListElement, 'post');
		setStatus(postsStatusElement, '正在加载推荐帖子…');
		try {
			const result = await actions.getRecommend({ n: 5 });
			if (result.error) {
				showError(postsStatusElement, '推荐帖子加载失败，请稍后重试。', loadPosts);
				return;
			}
			const items = result.data?.items ?? [];
			if (!items.length) {
				postsListElement.replaceChildren();
				setStatus(postsStatusElement, '暂无新的内容推荐。');
				const link = document.createElement('a');
				link.href = '/latest';
				link.className = 'recommend-empty-link';
				link.textContent = '浏览全站动态';
				postsStatusElement.appendChild(link);
				return;
			}
			renderPosts(items);
			setStatus(postsStatusElement);
		} catch {
			showError(postsStatusElement, '推荐帖子加载失败，请稍后重试。', loadPosts);
		} finally {
			postsPanelElement.removeAttribute('aria-busy');
		}
	}

	async function loadUsers() {
		usersPanelElement.setAttribute('aria-busy', 'true');
		showSkeletons(usersListElement, 'user');
		setStatus(usersStatusElement, '正在加载推荐用户…');
		try {
			const result = await actions.getRecommendUsers({ n: 5 });
			if (result.error) {
				showError(usersStatusElement, '推荐用户加载失败，请稍后重试。', loadUsers);
				return;
			}
			const items = result.data?.items ?? [];
			if (!items.length) {
				usersListElement.replaceChildren();
				showUsersEmptyState();
				return;
			}
			renderUsers(items);
			setStatus(usersStatusElement);
		} catch {
			showError(usersStatusElement, '推荐用户加载失败，请稍后重试。', loadUsers);
		} finally {
			usersPanelElement.removeAttribute('aria-busy');
		}
	}

	void loadPosts();
	void loadUsers();
})();
