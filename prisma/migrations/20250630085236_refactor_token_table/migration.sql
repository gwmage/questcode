/*
  Warnings:

  - You are about to drop the column `userId` on the `QAJob` table. All the data in the column will be lost.
  - You are about to drop the column `auth_token` on the `User` table. All the data in the column will be lost.
  - Added the required column `authTokenId` to the `QAJob` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `QAJob` DROP FOREIGN KEY `QAJob_userId_fkey`;

-- DropIndex
DROP INDEX `QAJob_userId_fkey` ON `QAJob`;

-- DropIndex
DROP INDEX `User_auth_token_key` ON `User`;

-- AlterTable
ALTER TABLE `QAJob` DROP COLUMN `userId`,
    ADD COLUMN `authTokenId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `auth_token`;

-- CreateTable
CREATE TABLE `AuthToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuthToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QAJob` ADD CONSTRAINT `QAJob_authTokenId_fkey` FOREIGN KEY (`authTokenId`) REFERENCES `AuthToken`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
